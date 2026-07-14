import { LineSegments, Mesh } from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCityTerrain } from "./CityTerrain";
import type { GeographyAsset } from "./geographyAsset";

const asset: GeographyAsset = {
  schema_version: 1,
  metadata: {
    source: [],
    license: {
      name: "Open Data Commons Open Database License 1.0",
      id: "ODbL-1.0",
      url: "https://opendatacommons.org/licenses/odbl/1-0/",
      attribution: "© OpenStreetMap contributors",
      attribution_url: "https://www.openstreetmap.org/copyright",
    },
    generated_at: "2026-07-13T00:00:00.000Z",
    source_snapshot_at: null,
    bounds: [113.75, 22.15, 114.45, 22.78],
    coordinate_order: "longitude-latitude",
    simplification: { algorithm: "Douglas-Peucker", tolerance_degrees: 0.00055 },
    road_limits: { motorway: 1, trunk: 1, primary: 1 },
    disclaimer: "Visualization only",
  },
  cities: [
    {
      id: "sz",
      region: "shenzhen",
      name: "Shenzhen",
      osm: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [[113.9, 22.5], [114.15, 22.5], [114.15, 22.7], [113.9, 22.7], [113.9, 22.5]],
          [[114.0, 22.56], [114.05, 22.56], [114.05, 22.6], [114.0, 22.6], [114.0, 22.56]],
        ],
      },
    },
    {
      id: "hk",
      region: "hong-kong",
      name: "Hong Kong",
      osm: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [[[114.0, 22.25], [114.2, 22.25], [114.2, 22.42], [114.0, 22.42], [114.0, 22.25]]],
          [[[113.84, 22.2], [113.95, 22.2], [113.95, 22.3], [113.84, 22.3], [113.84, 22.2]]],
        ],
      },
    },
  ],
  boundary_lines: [
    { id: "coast", kind: "coastline", coordinates: [[113.9, 22.4], [114.2, 22.4]] },
    { id: "admin", kind: "administrative-outline", coordinates: [[113.9, 22.5], [114.2, 22.5]] },
  ],
  roads: [
    { id: "m", class: "motorway", city: "shenzhen", coordinates: [[113.9, 22.6], [114.1, 22.6]] },
    { id: "t", class: "trunk", city: "shenzhen", coordinates: [[113.9, 22.58], [114.1, 22.58]] },
    { id: "p", class: "primary", city: "hong-kong", coordinates: [[114.0, 22.3], [114.2, 22.3]] },
  ],
};

let canvasContextSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  canvasContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterAll(() => canvasContextSpy.mockRestore());

describe("city terrain geography layers", () => {
  it("supports polygon holes and multipolygons while batching render layers", () => {
    const visual = createCityTerrain("high", asset);

    expect(visual.group.children.filter((child) => child.name.startsWith("terrain-land-"))).toHaveLength(2);
    expect(visual.group.children.filter((child) => child.name.startsWith("terrain-road-"))).toHaveLength(3);
    expect(visual.group.children.filter((child) => child.name.startsWith("terrain-boundary-"))).toHaveLength(2);
    expect(visual.group.getObjectByName("terrain-road-primary")).toBeInstanceOf(LineSegments);
    expect(visual.group.getObjectByName("terrain-water")).toBeInstanceOf(Mesh);
    visual.dispose();
  });

  it("updates in place and disposes tracked GPU resources only once", () => {
    const visual = createCityTerrain("medium", asset);
    const water = visual.group.getObjectByName("terrain-water") as Mesh;
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    water.geometry.addEventListener("dispose", geometryDisposed);
    if (Array.isArray(water.material)) throw new Error("terrain water must use one material");
    water.material.addEventListener("dispose", materialDisposed);
    const children = [...visual.group.children];
    const positionAttribute = water.geometry.getAttribute("position");

    visual.update(4, true);

    expect(visual.group.children).toEqual(children);
    expect(water.geometry.getAttribute("position")).toBe(positionAttribute);
    visual.dispose();
    visual.dispose();
    expect(geometryDisposed).toHaveBeenCalledTimes(1);
    expect(materialDisposed).toHaveBeenCalledTimes(1);
  });
});
