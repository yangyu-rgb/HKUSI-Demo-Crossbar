import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { createBorderPort } from "./BorderPort";
import { createBorderRoute } from "./BorderRoute";
import { createCityBuildings } from "./CityBuildings";
import { createCityTerrain } from "./CityTerrain";
import { createSceneBounds } from "./cameraFraming";
import { QUALITY_CONFIG } from "./congestionConfig";
import { CITY_POLYGONS } from "./geographicData";
import { cityPolygonsFromAsset, geographyCoordinates, type GeographyAsset } from "./geographyAsset";
import { projectGeo } from "./geoProjection";
import { RouteAutoTour } from "./RouteAutoTour";
import { SceneCameraController } from "./SceneCameraController";
import type { NormalizedRouteStatus, PortVisual, QualityLevel, RouteVisual, SceneCallbacks } from "./types";

export class BorderCommuteScene {
  readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(42, 1, 0.1, 140);
  private readonly cameraController: SceneCameraController;
  private readonly terrain;
  private readonly buildings;
  private readonly routes = new Map<string, RouteVisual>();
  private readonly ports = new Map<string, PortVisual>();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2(2, 2);
  private readonly pointerPosition = new Vector2();
  private readonly focusTarget = new Vector3();
  private readonly tooltipAnchor = new Vector3();
  private readonly clock = new Clock();
  private readonly resizeObserver: ResizeObserver;
  private readonly intersectionObserver: IntersectionObserver;
  private readonly autoTour: RouteAutoTour;
  private frame = 0;
  private lastFrameTime = performance.now();
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private pointerDirty = false;
  private pointerStart: { x: number; y: number } | null = null;
  private visible = true;
  private disposed = false;
  private lastPerformanceUpdate = 0;
  private autoTourPaused = false;

  private readonly pauseAutoTour = () => {
    if (!this.autoTour?.enabled || this.reducedMotion) return;
    this.autoTour.pauseFor(8000);
    if (this.autoTourPaused) return;
    this.autoTourPaused = true;
    this.callbacks.onAutoTourPauseChange?.(true);
  };

  constructor(
    private readonly container: HTMLDivElement,
    statuses: NormalizedRouteStatus[],
    private readonly quality: QualityLevel,
    private readonly reducedMotion: boolean,
    geographyAsset: GeographyAsset | null,
    private readonly callbacks: SceneCallbacks,
  ) {
    this.renderer = new WebGLRenderer({ antialias: quality !== "low", alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_CONFIG[quality].pixelRatio));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = QUALITY_CONFIG[quality].shadows;
    this.renderer.shadowMap.autoUpdate = QUALITY_CONFIG[quality].shadows;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.renderer.domElement.tabIndex = -1;
    this.container.appendChild(this.renderer.domElement);

    this.scene.background = new Color("#030914");
    this.scene.fog = new FogExp2(0x07111f, 0.025);
    this.scene.add(new HemisphereLight(0x9fc8ec, 0x09101c, 1.6));
    const keyLight = new DirectionalLight(0xe6f2ff, quality === "low" ? 1.8 : 2.35);
    keyLight.position.set(-7, 14, 9);
    keyLight.castShadow = QUALITY_CONFIG[quality].shadows;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 38;
    this.scene.add(keyLight);

    const cityPolygons = geographyAsset ? cityPolygonsFromAsset(geographyAsset) : CITY_POLYGONS;
    this.terrain = createCityTerrain(quality, geographyAsset ?? undefined);
    this.buildings = createCityBuildings(quality, cityPolygons);
    this.scene.add(this.terrain.group, this.buildings.group);
    statuses.forEach((status, index) => {
      const route = createBorderRoute(status, quality, index);
      const port = createBorderPort(status, quality);
      this.routes.set(status.id, route);
      this.ports.set(status.id, port);
      this.scene.add(route.group, port.group);
    });

    const geographicPoints = [
      ...(geographyAsset ? geographyCoordinates(geographyAsset) : CITY_POLYGONS.flatMap((polygon) => polygon.points)),
      ...statuses.flatMap((status) => [...status.route, status.position]),
    ].map((point) => projectGeo(point));
    this.cameraController = new SceneCameraController(
      this.camera,
      this.container,
      createSceneBounds(geographicPoints),
      this.pauseAutoTour,
    );
    this.autoTour = new RouteAutoTour([...this.routes.keys()], (routeId) => {
      if (this.reducedMotion) {
        this.selectedId = routeId;
        this.applyEmphasis(routeId);
        this.callbacks.onSelectionChange({ routeId, source: "tour" });
        return;
      }
      this.applySelection(routeId, "tour", true);
    });
    if (this.reducedMotion) {
      this.autoTour.setEnabled(false);
      this.callbacks.onAutoTourChange(false);
    } else {
      this.autoTour.start(performance.now());
    }

    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.handlePointerUp);
    this.renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost);

    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.container);
    this.intersectionObserver = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; }, { threshold: 0.05 });
    this.intersectionObserver.observe(this.container);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.resize();
    this.callbacks.onAvailabilityChange?.(true);
    this.render();
  }

  updateStatuses(statuses: NormalizedRouteStatus[]): void {
    statuses.forEach((status) => {
      this.routes.get(status.id)?.updateStatus(status);
      this.ports.get(status.id)?.updateStatus(status);
    });
  }

  focus(routeId: string | null): void {
    this.pauseAutoTour();
    this.hoveredId = null;
    this.container.classList.remove("is-route-hovered");
    this.callbacks.onHover(null);
    this.applySelection(routeId, routeId ? "selected" : "overview", !this.reducedMotion);
  }

  setAutoTour(enabled: boolean): void {
    const nextEnabled = enabled && !this.reducedMotion;
    this.autoTour.setEnabled(nextEnabled);
    this.autoTourPaused = false;
    this.callbacks.onAutoTourPauseChange?.(false);
    this.callbacks.onAutoTourChange(nextEnabled);
  }

  private applySelection(routeId: string | null, source: "overview" | "selected" | "tour", animate: boolean): void {
    this.selectedId = routeId;
    this.applyEmphasis(routeId);
    const port = routeId ? this.ports.get(routeId) : null;
    if (port) {
      this.focusTarget.copy(port.group.position);
      this.focusTarget.y = 0.35;
      this.cameraController.focus(this.focusTarget, animate);
    } else {
      this.cameraController.focus(null, animate);
    }
    this.callbacks.onSelectionChange({ routeId, source });
  }

  private applyEmphasis(activeId: string | null): void {
    this.routes.forEach((route, id) => route.setEmphasis(!activeId ? "default" : id === activeId ? "active" : "dimmed"));
    this.ports.forEach((port, id) => port.setEmphasis(!activeId ? "default" : id === activeId ? "active" : "dimmed"));
  }

  private updateHover(): void {
    if (!this.pointerDirty || this.selectedId) return;
    this.pointerDirty = false;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = [
      ...[...this.routes.values()].map((route) => route.pickMesh),
      ...[...this.ports.values()].flatMap((port) => port.pickMeshes),
    ];
    const next = this.raycaster.intersectObjects(targets, false)[0]?.object.userData.routeId as string | undefined;
    const nextId = next ?? null;
    if (nextId === this.hoveredId) return;
    this.hoveredId = nextId;
    this.container.classList.toggle("is-route-hovered", Boolean(nextId));
    this.applyEmphasis(nextId);
    this.callbacks.onHover(nextId);
    if (nextId) {
      this.callbacks.onTooltipPosition?.(this.pointerPosition.x, this.pointerPosition.y);
      this.pauseAutoTour();
    }
  }

  private readonly handlePointerMove = (event: PointerEvent) => {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.pointerPosition.set(event.clientX - bounds.left, event.clientY - bounds.top);
    if (this.hoveredId && !this.selectedId) {
      this.callbacks.onTooltipPosition?.(this.pointerPosition.x, this.pointerPosition.y);
    }
    if (this.pointerStart) this.pauseAutoTour();
    this.pointerDirty = true;
  };

  private readonly handlePointerLeave = () => {
    this.pointer.set(2, 2);
    this.pointerDirty = false;
    if (!this.hoveredId || this.selectedId) return;
    this.hoveredId = null;
    this.container.classList.remove("is-route-hovered");
    this.applyEmphasis(null);
    this.callbacks.onHover(null);
  };

  private readonly handlePointerDown = (event: PointerEvent) => {
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.pauseAutoTour();
  };

  private readonly handlePointerUp = (event: PointerEvent) => {
    const pointerStart = this.pointerStart;
    this.pointerStart = null;
    if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6) return;
    if (this.hoveredId) this.focus(this.hoveredId);
  };

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    this.callbacks.onAvailabilityChange?.(false);
  };

  private readonly handleVisibilityChange = () => {
    this.visible = document.visibilityState === "visible";
    if (this.visible) this.lastFrameTime = performance.now();
  };

  private readonly resize = () => {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.cameraController.setViewportAspect(this.camera.aspect, this.selectedId === null);
  };

  private updateTooltipPosition(): void {
    if (!this.selectedId) return;
    const port = this.ports.get(this.selectedId);
    if (!port) return;
    this.tooltipAnchor.copy(port.group.position);
    this.tooltipAnchor.y += 1.05;
    this.tooltipAnchor.project(this.camera);
    this.callbacks.onTooltipPosition?.(
      (this.tooltipAnchor.x * 0.5 + 0.5) * this.container.clientWidth,
      (-this.tooltipAnchor.y * 0.5 + 0.5) * this.container.clientHeight,
    );
  }

  private readonly render = (time = performance.now()) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.render);
    if (!this.visible || document.visibilityState === "hidden") return;
    const deltaSeconds = Math.min(0.05, Math.max(0, (time - this.lastFrameTime) / 1000));
    this.lastFrameTime = time;
    const elapsedSeconds = this.clock.getElapsedTime();
    const motionEnabled = !this.reducedMotion;
    this.updateHover();
    this.autoTour.update(time);
    if (this.autoTourPaused && !this.autoTour.isPaused(time)) {
      this.autoTourPaused = false;
      this.callbacks.onAutoTourPauseChange?.(false);
    }
    this.cameraController.update(time);
    this.updateTooltipPosition();
    this.terrain.update(elapsedSeconds, motionEnabled);
    this.routes.forEach((route) => route.update(deltaSeconds, elapsedSeconds, motionEnabled));
    this.ports.forEach((port) => port.update(elapsedSeconds, motionEnabled));
    this.renderer.render(this.scene, this.camera);
    if (import.meta.env.DEV && this.callbacks.onPerformanceUpdate && time - this.lastPerformanceUpdate > 1000) {
      this.lastPerformanceUpdate = time;
      const info = this.renderer.info;
      this.callbacks.onPerformanceUpdate(`${info.render.calls} calls · ${(info.render.triangles / 1000).toFixed(1)}k tris · ${info.memory.geometries} geo · ${info.memory.textures} tex`);
    }
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.removeEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.removeEventListener("pointerup", this.handlePointerUp);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.handleContextLost);
    this.cameraController.dispose();
    this.routes.forEach((route) => route.dispose());
    this.ports.forEach((port) => port.dispose());
    this.terrain.dispose();
    this.buildings.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
