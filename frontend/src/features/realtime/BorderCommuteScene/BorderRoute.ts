import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  ShaderMaterial,
  TubeGeometry,
  Vector3,
} from "three";
import { CONGESTION_CONFIG, QUALITY_CONFIG } from "./congestionConfig";
import { projectGeo } from "./geoProjection";
import { createParticleOffsets, mapParticleProgress, ROUTE_RADII } from "./routeMotion";
import type { NormalizedRouteStatus, QualityLevel, RouteVisual } from "./types";

const CURVE_SAMPLE_COUNT = 360;

function createStatusMaterial(color: string, opacity: number, width: number, additive = false): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : undefined,
    uniforms: {
      uColor: { value: new Color(color) },
      uOpacity: { value: opacity },
      uWidth: { value: width },
    },
    vertexShader: `
      attribute vec3 routeCenter;
      uniform float uWidth;
      void main() {
        vec3 transformed = routeCenter + (position - routeCenter) * uWidth;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() { gl_FragColor = vec4(uColor, uOpacity); }
    `,
  });
}

function addCurveCenters(geometry: TubeGeometry, curve: CatmullRomCurve3, tubularSegments: number, radialSegments: number): void {
  const centers = new Float32Array((tubularSegments + 1) * (radialSegments + 1) * 3);
  const point = new Vector3();
  for (let segment = 0; segment <= tubularSegments; segment += 1) {
    curve.getPoint(segment / tubularSegments, point);
    for (let radial = 0; radial <= radialSegments; radial += 1) {
      const offset = (segment * (radialSegments + 1) + radial) * 3;
      centers[offset] = point.x;
      centers[offset + 1] = point.y;
      centers[offset + 2] = point.z;
    }
  }
  geometry.setAttribute("routeCenter", new BufferAttribute(centers, 3));
}

function sampleCurve(curve: CatmullRomCurve3): Float32Array {
  const samples = new Float32Array(CURVE_SAMPLE_COUNT * 3);
  const point = new Vector3();
  for (let index = 0; index < CURVE_SAMPLE_COUNT; index += 1) {
    curve.getPoint(index / (CURVE_SAMPLE_COUNT - 1), point);
    const offset = index * 3;
    samples[offset] = point.x;
    samples[offset + 1] = point.y;
    samples[offset + 2] = point.z;
  }
  return samples;
}

export function createBorderRoute(status: NormalizedRouteStatus, quality: QualityLevel, routeIndex: number): RouteVisual {
  const group = new Group();
  group.name = `route-${status.id}`;
  const points = status.route.map((point, index) => {
    const progress = index / Math.max(1, status.route.length - 1);
    const arc = Math.sin(progress * Math.PI) * (0.58 + routeIndex * 0.08);
    return projectGeo(point, 0.34 + arc);
  });
  const curve = new CatmullRomCurve3(points, false, "centripetal", 0.5);
  const segments = quality === "low" ? 64 : 96;
  const radialSegments = quality === "high" ? 10 : 8;

  const baseGeometry = new TubeGeometry(curve, segments, ROUTE_RADII.shadow, radialSegments, false);
  const baseMaterial = new MeshBasicMaterial({ color: 0x091421, transparent: true, opacity: 0.78 });
  const base = new Mesh(baseGeometry, baseMaterial);
  base.renderOrder = 10;
  group.add(base);

  const statusConfig = CONGESTION_CONFIG[status.congestionLevel];
  const coreGeometry = new TubeGeometry(curve, segments, ROUTE_RADII.core, radialSegments, false);
  addCurveCenters(coreGeometry, curve, segments, radialSegments);
  const coreMaterial = createStatusMaterial(statusConfig.color, 0.98, statusConfig.routeWidth);
  const core = new Mesh(coreGeometry, coreMaterial);
  core.renderOrder = 12;
  group.add(core);

  const glowGeometry = new TubeGeometry(curve, segments, ROUTE_RADII.glow, radialSegments, false);
  addCurveCenters(glowGeometry, curve, segments, radialSegments);
  const glowMaterial = createStatusMaterial(statusConfig.color, 0.18, statusConfig.routeWidth, true);
  const glow = new Mesh(glowGeometry, glowMaterial);
  glow.renderOrder = 11;
  group.add(glow);

  const pickGeometry = new TubeGeometry(curve, Math.max(40, Math.floor(segments / 2)), ROUTE_RADII.pick, 6, false);
  const pickMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const pickMesh = new Mesh(pickGeometry, pickMaterial);
  pickMesh.userData.routeId = status.id;
  pickMesh.renderOrder = 14;
  group.add(pickMesh);

  const maxParticles = Math.max(18, Math.round(70 * QUALITY_CONFIG[quality].particleScale));
  const particlePositions = new Float32Array(maxParticles * 3);
  const particleOffsets = createParticleOffsets(maxParticles, routeIndex);
  const particleGeometry = new BufferGeometry();
  particleGeometry.setAttribute("position", new BufferAttribute(particlePositions, 3));
  const particleMaterial = new PointsMaterial({
    color: statusConfig.color,
    size: quality === "low" ? 0.125 : 0.155,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    sizeAttenuation: true,
    blending: AdditiveBlending,
  });
  const particles = new Points(particleGeometry, particleMaterial);
  particles.renderOrder = 13;
  group.add(particles);

  const curveSamples = sampleCurve(curve);
  const initialParticles = Math.round(maxParticles * statusConfig.particleDensity);
  particleGeometry.setDrawRange(0, initialParticles);
  const targetColor = new Color(statusConfig.color);

  const visual: RouteVisual = {
    id: status.id,
    status,
    group,
    curve,
    pickMesh,
    base,
    core,
    glow,
    coreMaterial,
    glowMaterial,
    particles,
    particleMaterial,
    particlePositions,
    particleOffsets,
    curveSamples,
    maxParticles,
    visibleParticles: initialParticles,
    targetParticles: initialParticles,
    currentSpeed: statusConfig.particleSpeed,
    targetSpeed: statusConfig.particleSpeed,
    currentQueueStrength: statusConfig.queueStrength,
    targetQueueStrength: statusConfig.queueStrength,
    currentWidth: statusConfig.routeWidth,
    targetWidth: statusConfig.routeWidth,
    currentColor: targetColor.clone(),
    targetColor,
    phase: routeIndex * 0.17,
    updateStatus(nextStatus) {
      this.status = nextStatus;
      const next = CONGESTION_CONFIG[nextStatus.congestionLevel];
      this.targetColor.set(next.color);
      this.targetParticles = Math.round(this.maxParticles * next.particleDensity);
      this.targetSpeed = next.particleSpeed;
      this.targetQueueStrength = next.queueStrength;
      this.targetWidth = next.routeWidth;
    },
    setEmphasis(state) {
      const coreOpacity = state === "dimmed" ? 0.2 : 0.98;
      const glowOpacity = state === "active" ? 0.36 : state === "dimmed" ? 0.03 : 0.18;
      this.coreMaterial.uniforms.uOpacity.value = coreOpacity;
      this.glowMaterial.uniforms.uOpacity.value = glowOpacity;
      this.particleMaterial.opacity = state === "dimmed" ? 0.12 : 1;
      this.particleMaterial.size = state === "active" ? (quality === "low" ? 0.155 : 0.195) : (quality === "low" ? 0.125 : 0.155);
    },
    update(deltaSeconds, elapsedSeconds, motionEnabled) {
      const transition = 1 - Math.exp(-deltaSeconds * 3.6);
      this.currentColor.lerp(this.targetColor, transition);
      this.currentSpeed += (this.targetSpeed - this.currentSpeed) * transition;
      this.currentQueueStrength += (this.targetQueueStrength - this.currentQueueStrength) * transition;
      this.currentWidth += (this.targetWidth - this.currentWidth) * transition;
      this.visibleParticles += (this.targetParticles - this.visibleParticles) * transition;
      const particleCount = Math.max(1, Math.round(this.visibleParticles));
      particleGeometry.setDrawRange(0, particleCount);
      this.coreMaterial.uniforms.uColor.value.copy(this.currentColor);
      this.glowMaterial.uniforms.uColor.value.copy(this.currentColor);
      this.coreMaterial.uniforms.uWidth.value = this.currentWidth;
      this.glowMaterial.uniforms.uWidth.value = this.currentWidth;
      this.particleMaterial.color.copy(this.currentColor);
      const travel = (motionEnabled ? elapsedSeconds * (0.055 + this.currentSpeed * 0.105) : 0) + this.phase;
      for (let index = 0; index < particleCount; index += 1) {
        const direction: 1 | -1 = index % 2 === 0 ? 1 : -1;
        const progress = mapParticleProgress(
          this.particleOffsets[index] + travel * direction,
          direction,
          this.currentQueueStrength,
        );
        const samplePosition = progress * (CURVE_SAMPLE_COUNT - 1);
        const first = Math.floor(samplePosition);
        const second = Math.min(CURVE_SAMPLE_COUNT - 1, first + 1);
        const mix = samplePosition - first;
        const targetOffset = index * 3;
        const firstOffset = first * 3;
        const secondOffset = second * 3;
        const previousOffset = Math.max(0, first - 1) * 3;
        const followingOffset = Math.min(CURVE_SAMPLE_COUNT - 1, second + 1) * 3;
        const tangentX = this.curveSamples[followingOffset] - this.curveSamples[previousOffset];
        const tangentZ = this.curveSamples[followingOffset + 2] - this.curveSamples[previousOffset + 2];
        const tangentLength = Math.max(0.0001, Math.hypot(tangentX, tangentZ));
        const laneOffset = direction * 0.042 + ((index % 4) - 1.5) * 0.004;
        const laneX = -tangentZ / tangentLength * laneOffset;
        const laneZ = tangentX / tangentLength * laneOffset;
        this.particlePositions[targetOffset] = this.curveSamples[firstOffset]
          + (this.curveSamples[secondOffset] - this.curveSamples[firstOffset]) * mix
          + laneX;
        this.particlePositions[targetOffset + 1] = this.curveSamples[firstOffset + 1] + (this.curveSamples[secondOffset + 1] - this.curveSamples[firstOffset + 1]) * mix + (index % 2) * 0.018;
        this.particlePositions[targetOffset + 2] = this.curveSamples[firstOffset + 2]
          + (this.curveSamples[secondOffset + 2] - this.curveSamples[firstOffset + 2]) * mix
          + laneZ;
      }
      (particleGeometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    },
    dispose() {
      baseGeometry.dispose();
      baseMaterial.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      pickGeometry.dispose();
      pickMaterial.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
    },
  };
  visual.update(0, 0, true);
  return visual;
}
