import type { CatmullRomCurve3, Color, Group, Mesh, Points, PointsMaterial, BufferGeometry, ShaderMaterial } from "three";

export type CongestionLevel = "smooth" | "normal" | "crowded" | "severe";
export type QualityLevel = "low" | "medium" | "high";

export type GeoCoordinate = {
  lng: number;
  lat: number;
};

export type BorderRouteGeography = {
  id: string;
  position: GeoCoordinate;
  route: GeoCoordinate[];
  labelOffset: [number, number, number];
};

export type NormalizedRouteStatus = {
  id: string;
  name: string;
  nameEn: string;
  congestionLevel: CongestionLevel;
  waitingTime: number;
  queueCount: number;
  route: GeoCoordinate[];
  position: GeoCoordinate;
  labelOffset: [number, number, number];
};

export type RouteVisual = {
  id: string;
  status: NormalizedRouteStatus;
  group: Group;
  curve: CatmullRomCurve3;
  pickMesh: Mesh;
  base: Mesh;
  core: Mesh;
  glow: Mesh;
  coreMaterial: ShaderMaterial;
  glowMaterial: ShaderMaterial;
  particles: Points<BufferGeometry, PointsMaterial>;
  particleMaterial: PointsMaterial;
  particlePositions: Float32Array;
  particleOffsets: Float32Array;
  curveSamples: Float32Array;
  maxParticles: number;
  visibleParticles: number;
  targetParticles: number;
  currentSpeed: number;
  targetSpeed: number;
  currentQueueStrength: number;
  targetQueueStrength: number;
  currentWidth: number;
  targetWidth: number;
  currentColor: Color;
  targetColor: Color;
  phase: number;
  updateStatus: (status: NormalizedRouteStatus) => void;
  setEmphasis: (state: "default" | "active" | "dimmed") => void;
  update: (deltaSeconds: number, elapsedSeconds: number, motionEnabled: boolean) => void;
  dispose: () => void;
};

export type PortVisual = {
  id: string;
  group: Group;
  pickMeshes: Mesh[];
  updateStatus: (status: NormalizedRouteStatus) => void;
  setEmphasis: (state: "default" | "active" | "dimmed") => void;
  update: (elapsedSeconds: number, motionEnabled: boolean) => void;
  dispose: () => void;
};

export type SceneSelection = {
  routeId: string | null;
  source: "overview" | "hover" | "selected" | "tour";
};

export type SceneCallbacks = {
  onHover: (routeId: string | null, clientX?: number, clientY?: number) => void;
  onSelectionChange: (selection: SceneSelection) => void;
  onAutoTourChange: (enabled: boolean) => void;
  onAutoTourPauseChange?: (paused: boolean) => void;
  onTooltipPosition?: (x: number, y: number) => void;
  onAvailabilityChange?: (available: boolean) => void;
  onPerformanceUpdate?: (summary: string) => void;
};
