import type { CongestionLevel, QualityLevel } from "./types";

export const CONGESTION_CONFIG = {
  smooth: {
    label: "畅通",
    color: "#32e6a1",
    particleDensity: 0.34,
    particleSpeed: 1,
    queueStrength: 0.08,
    routeWidth: 1,
  },
  normal: {
    label: "一般",
    color: "#f6c453",
    particleDensity: 0.55,
    particleSpeed: 0.72,
    queueStrength: 0.34,
    routeWidth: 1.08,
  },
  crowded: {
    label: "拥挤",
    color: "#ff8a3d",
    particleDensity: 0.78,
    particleSpeed: 0.45,
    queueStrength: 0.68,
    routeWidth: 1.16,
  },
  severe: {
    label: "严重拥挤",
    color: "#ff4d4f",
    particleDensity: 1,
    particleSpeed: 0.2,
    queueStrength: 1,
    routeWidth: 1.25,
  },
} as const satisfies Record<CongestionLevel, {
  label: string;
  color: string;
  particleDensity: number;
  particleSpeed: number;
  queueStrength: number;
  routeWidth: number;
}>;

export const QUALITY_CONFIG = {
  low: { pixelRatio: 1, particleScale: 0.55, buildingCount: 55, shadows: false, waterMotion: false },
  medium: { pixelRatio: 1.5, particleScale: 0.78, buildingCount: 105, shadows: false, waterMotion: true },
  high: { pixelRatio: 1.75, particleScale: 1, buildingCount: 160, shadows: true, waterMotion: true },
} as const satisfies Record<QualityLevel, {
  pixelRatio: number;
  particleScale: number;
  buildingCount: number;
  shadows: boolean;
  waterMotion: boolean;
}>;

export function congestionLevelForWait(waitingTime: number): CongestionLevel {
  if (waitingTime >= 50) return "severe";
  if (waitingTime >= 35) return "crowded";
  if (waitingTime >= 18) return "normal";
  return "smooth";
}
