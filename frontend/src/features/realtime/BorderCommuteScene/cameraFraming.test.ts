import { describe, expect, it } from "vitest";
import { calculateOverviewFrame, createSceneBounds } from "./cameraFraming";

describe("camera framing", () => {
  it("builds padded bounds from projected scene points", () => {
    expect(createSceneBounds([
      { x: -3, y: 0, z: 2 },
      { x: 5, y: 0, z: -4 },
    ], 1)).toEqual({ minX: -4, maxX: 6, minY: -0.18, maxY: 2.2, minZ: -5, maxZ: 3 });
  });

  it("moves farther away for a narrow viewport", () => {
    const bounds = createSceneBounds([
      { x: -10, y: 0, z: -8 },
      { x: 10, y: 0, z: 8 },
    ]);
    const landscape = calculateOverviewFrame(bounds, 16 / 9, 42);
    const portrait = calculateOverviewFrame(bounds, 3 / 4, 42);

    expect(portrait.distance).toBeGreaterThan(landscape.distance);
    expect(portrait.target).toEqual(landscape.target);
  });

  it("keeps the overview camera above the terrain", () => {
    const frame = calculateOverviewFrame(
      { minX: -8, maxX: 9, minY: -0.2, maxY: 2.2, minZ: -9, maxZ: 8 },
      1,
      42,
    );

    expect(frame.position.y).toBeGreaterThan(frame.target.y);
    expect(frame.distance).toBeGreaterThan(0);
  });

  it("fits every scene corner inside the requested perspective", () => {
    const bounds = { minX: -8, maxX: 9, minY: -0.2, maxY: 2.2, minZ: -9, maxZ: 8 };
    const aspect = 0.75;
    const fov = 42;
    const frame = calculateOverviewFrame(bounds, aspect, fov);
    const view = {
      x: (frame.target.x - frame.position.x) / frame.distance,
      y: (frame.target.y - frame.position.y) / frame.distance,
      z: (frame.target.z - frame.position.z) / frame.distance,
    };
    const rightLength = Math.hypot(view.z, view.x);
    const right = { x: -view.z / rightLength, y: 0, z: view.x / rightLength };
    const up = {
      x: right.y * view.z - right.z * view.y,
      y: right.z * view.x - right.x * view.z,
      z: right.x * view.y - right.y * view.x,
    };
    const tanVertical = Math.tan(fov * Math.PI / 360);
    const tanHorizontal = tanVertical * aspect;

    for (const x of [bounds.minX, bounds.maxX]) {
      for (const y of [bounds.minY, bounds.maxY]) {
        for (const z of [bounds.minZ, bounds.maxZ]) {
          const relative = { x: x - frame.position.x, y: y - frame.position.y, z: z - frame.position.z };
          const depth = relative.x * view.x + relative.y * view.y + relative.z * view.z;
          const horizontal = Math.abs(relative.x * right.x + relative.y * right.y + relative.z * right.z);
          const vertical = Math.abs(relative.x * up.x + relative.y * up.y + relative.z * up.z);
          expect(horizontal).toBeLessThanOrEqual(depth * tanHorizontal);
          expect(vertical).toBeLessThanOrEqual(depth * tanVertical);
        }
      }
    }
  });
});
