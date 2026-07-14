import { describe, expect, it } from "vitest";
import { cityPolygonsFromAsset, geographyCoordinates, validateGeographyAsset } from "./geographyAsset";

const validAsset = {
  schema_version: 1,
  metadata: {
    license: { id: "ODbL-1.0", attribution: "© OpenStreetMap contributors" },
    bounds: [113.75, 22.15, 114.45, 22.78],
  },
  cities: [
    { id: "sz", region: "shenzhen", geometry: { type: "Polygon", coordinates: [[[114, 22.4], [114.1, 22.4], [114.1, 22.5], [114, 22.4]]] } },
    { id: "hk", region: "hong-kong", geometry: { type: "Polygon", coordinates: [[[114, 22.2], [114.1, 22.2], [114.1, 22.3], [114, 22.2]]] } },
  ],
  roads: [{ id: "road", class: "trunk", city: "shenzhen", coordinates: [[114, 22.4], [114.1, 22.5]] }],
  boundary_lines: [],
};

describe("validateGeographyAsset", () => {
  it("accepts the supported schema with both city regions", () => {
    expect(() => validateGeographyAsset(validAsset)).not.toThrow();
  });

  it("rejects assets without ODbL attribution", () => {
    expect(() => validateGeographyAsset({
      ...validAsset,
      metadata: { ...validAsset.metadata, license: { id: "ODbL-1.0", attribution: "" } },
    })).toThrow(/ODbL attribution/);
  });

  it("rejects malformed road coordinates", () => {
    expect(() => validateGeographyAsset({ ...validAsset, roads: [{ id: "bad", coordinates: [[NaN, 22.4]] }] }))
      .toThrow(/invalid coordinates/);
  });

  it("adapts polygon assets for terrain, buildings and camera bounds", () => {
    validateGeographyAsset(validAsset);
    const polygons = cityPolygonsFromAsset(validAsset);

    expect(polygons).toHaveLength(2);
    expect(polygons.map((polygon) => polygon.city)).toEqual(["shenzhen", "hong-kong"]);
    expect(geographyCoordinates(validAsset)).toHaveLength(8);
  });
});
