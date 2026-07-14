import { MathUtils, MOUSE, PerspectiveCamera, TOUCH, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { calculateOverviewFrame, type CameraFrame, type SceneBounds } from "./cameraFraming";

const MIN_CAMERA_HEIGHT = 0.25;

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

export class SceneCameraController {
  readonly controls: OrbitControls;
  readonly camera: PerspectiveCamera;
  private animation: {
    start: number;
    duration: number;
    fromPosition: Vector3;
    toPosition: Vector3;
    fromTarget: Vector3;
    toTarget: Vector3;
  } | null = null;
  private readonly nextPosition = new Vector3();
  private readonly nextTarget = new Vector3();
  private readonly keyboardElement: HTMLElement;
  private readonly handleKeyboardInteraction: (event: KeyboardEvent) => void;
  private overviewFrame: CameraFrame;

  constructor(
    camera: PerspectiveCamera,
    element: HTMLElement,
    private readonly sceneBounds: SceneBounds,
    onInteraction: () => void,
  ) {
    this.camera = camera;
    this.keyboardElement = element;
    this.handleKeyboardInteraction = (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) onInteraction();
    };
    this.overviewFrame = calculateOverviewFrame(sceneBounds, camera.aspect, camera.fov);
    camera.position.set(this.overviewFrame.position.x, this.overviewFrame.position.y, this.overviewFrame.position.z);
    this.controls = new OrbitControls(camera, element);
    this.controls.target.set(this.overviewFrame.target.x, this.overviewFrame.target.y, this.overviewFrame.target.z);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 6.4;
    this.controls.maxDistance = Math.max(22, this.overviewFrame.distance * 1.35);
    this.controls.minPolarAngle = 0.48;
    this.controls.maxPolarAngle = 1.31;
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
    this.controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
    this.controls.listenToKeyEvents(element);
    this.keyboardElement.addEventListener("keydown", this.handleKeyboardInteraction);
    this.controls.addEventListener("start", () => {
      this.animation = null;
      onInteraction();
    });
    this.controls.update();
  }

  setViewportAspect(aspect: number, applyOverview: boolean): void {
    this.overviewFrame = calculateOverviewFrame(this.sceneBounds, aspect, this.camera.fov);
    this.controls.maxDistance = Math.max(22, this.overviewFrame.distance * 1.35);
    if (!applyOverview) return;
    this.camera.position.set(this.overviewFrame.position.x, this.overviewFrame.position.y, this.overviewFrame.position.z);
    this.controls.target.set(this.overviewFrame.target.x, this.overviewFrame.target.y, this.overviewFrame.target.z);
    this.animation = null;
    this.controls.update();
  }

  focus(target: Vector3 | null, animate: boolean): void {
    const toTarget = target?.clone() ?? new Vector3(
      this.overviewFrame.target.x,
      this.overviewFrame.target.y,
      this.overviewFrame.target.z,
    );
    const toPosition = target
      ? new Vector3(target.x + 3.7, Math.max(6.8, this.camera.position.y * 0.72), target.z + 5.7)
      : new Vector3(
        this.overviewFrame.position.x,
        this.overviewFrame.position.y,
        this.overviewFrame.position.z,
      );
    if (!animate) {
      this.camera.position.copy(toPosition);
      this.controls.target.copy(toTarget);
      this.controls.update();
      this.animation = null;
      return;
    }
    this.animation = {
      start: performance.now(),
      duration: target ? 1250 : 1450,
      fromPosition: this.camera.position.clone(),
      toPosition,
      fromTarget: this.controls.target.clone(),
      toTarget,
    };
  }

  update(time: number): void {
    if (this.animation) {
      const progress = MathUtils.clamp((time - this.animation.start) / this.animation.duration, 0, 1);
      const eased = easeInOutCubic(progress);
      this.nextPosition.lerpVectors(this.animation.fromPosition, this.animation.toPosition, eased);
      this.nextTarget.lerpVectors(this.animation.fromTarget, this.animation.toTarget, eased);
      this.camera.position.copy(this.nextPosition);
      this.controls.target.copy(this.nextTarget);
      if (progress >= 1) this.animation = null;
    }
    this.controls.target.x = MathUtils.clamp(this.controls.target.x, this.sceneBounds.minX, this.sceneBounds.maxX);
    this.controls.target.z = MathUtils.clamp(this.controls.target.z, this.sceneBounds.minZ, this.sceneBounds.maxZ);
    this.controls.target.y = MathUtils.clamp(this.controls.target.y, 0, Math.min(1.5, this.sceneBounds.maxY));
    this.camera.position.y = Math.max(MIN_CAMERA_HEIGHT, this.camera.position.y);
    this.controls.update();
  }

  dispose(): void {
    this.keyboardElement.removeEventListener("keydown", this.handleKeyboardInteraction);
    this.controls.stopListenToKeyEvents();
    this.controls.dispose();
  }
}
