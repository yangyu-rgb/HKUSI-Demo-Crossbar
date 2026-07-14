import { describe, expect, it } from "vitest";
import { createParticleOffsets, mapParticleProgress, PORT_ROUTE_PROGRESS, ROUTE_RADII } from "./routeMotion";

function countQueued(direction: 1 | -1, queueStrength: number): number {
  return Array.from({ length: 1000 }, (_, index) => mapParticleProgress(index / 1000, direction, queueStrength))
    .filter((progress) => direction === 1
      ? progress >= PORT_ROUTE_PROGRESS - 0.14 && progress <= PORT_ROUTE_PROGRESS
      : progress >= PORT_ROUTE_PROGRESS && progress <= PORT_ROUTE_PROGRESS + 0.14)
    .length;
}

describe("route motion mapping", () => {
  it("shrinks the visible route while preserving the generous pick radius", () => {
    expect(ROUTE_RADII.core).toBeCloseTo(0.069 * 0.76, 3);
    expect(ROUTE_RADII.glow).toBeCloseTo(0.16 * 0.74, 3);
    expect(ROUTE_RADII.pick).toBe(0.25);
  });

  it("creates deterministic staggered batches instead of uniform spacing", () => {
    const offsets = createParticleOffsets(12, 2);
    expect(offsets).toEqual(createParticleOffsets(12, 2));
    expect(offsets[1] - offsets[0]).not.toBeCloseTo(1 / 12, 3);
    expect(new Set(offsets).size).toBe(12);
  });

  it("accumulates more particles before the checkpoint as pressure rises in both directions", () => {
    expect(countQueued(1, 1)).toBeGreaterThan(countQueued(1, 0));
    expect(countQueued(-1, 1)).toBeGreaterThan(countQueued(-1, 0));
    expect(mapParticleProgress(0.35, 1, 0.8)).toBeLessThanOrEqual(PORT_ROUTE_PROGRESS);
    expect(mapParticleProgress(0.35, -1, 0.8)).toBeGreaterThanOrEqual(PORT_ROUTE_PROGRESS);
  });
});
