import type { GeoCoordinate } from "./types";
import type { CityPolygon } from "./geographicData";

export type GeographyRegion = "shenzhen" | "hong-kong";
export type RoadClass = "motorway" | "trunk" | "primary";
type GeoTuple = [lng: number, lat: number];
type PolygonGeometry = { type: "Polygon"; coordinates: GeoTuple[][] };
type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: GeoTuple[][][] };

export type GeographyAsset = {
  schema_version: 1;
  metadata: {
    source: Array<{ provider: string; endpoint: string; usage: string; query?: string; osm_relation_ids?: string[] }>;
    license: { name: string; id: "ODbL-1.0"; url: string; attribution: string; attribution_url: string };
    generated_at: string;
    source_snapshot_at: string | null;
    bounds: [west: number, south: number, east: number, north: number];
    coordinate_order: "longitude-latitude";
    simplification: { algorithm: "Douglas-Peucker"; tolerance_degrees: number };
    road_limits: Record<RoadClass, number>;
    disclaimer: string;
  };
  cities: Array<{
    id: string;
    region: GeographyRegion;
    name: string;
    osm: { type?: string; id?: number };
    geometry: PolygonGeometry | MultiPolygonGeometry;
  }>;
  boundary_lines: Array<{
    id: string;
    region?: GeographyRegion;
    kind: "administrative-outline" | "coastline";
    coordinates: GeoTuple[];
  }>;
  roads: Array<{
    id: string;
    name?: string;
    class: RoadClass;
    city: GeographyRegion;
    coordinates: GeoTuple[];
  }>;
};

export const GEOGRAPHY_ASSET_URL = "/data/hk-shenzhen-geography.json";

function isFiniteTuple(value: unknown): value is GeoTuple {
  return Array.isArray(value) && value.length === 2 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function isRegion(value: unknown): value is GeographyRegion {
  return value === "shenzhen" || value === "hong-kong";
}

function hasValidRings(geometry: unknown): geometry is PolygonGeometry | MultiPolygonGeometry {
  if (!geometry || typeof geometry !== "object") return false;
  const candidate = geometry as Partial<PolygonGeometry | MultiPolygonGeometry>;
  if (candidate.type !== "Polygon" && candidate.type !== "MultiPolygon") return false;
  const coordinates = candidate.type === "Polygon" ? [candidate.coordinates] : candidate.coordinates;
  return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every((polygon) => (
    Array.isArray(polygon) && polygon.length > 0 && polygon.every((ring) => (
      Array.isArray(ring) && ring.length >= 4 && ring.every(isFiniteTuple)
    ))
  ));
}

export function validateGeographyAsset(value: unknown): asserts value is GeographyAsset {
  if (!value || typeof value !== "object") throw new Error("Geography asset is not an object");
  const asset = value as Partial<GeographyAsset>;
  if (asset.schema_version !== 1) throw new Error(`Unsupported geography schema: ${String(asset.schema_version)}`);
  if (asset.metadata?.license?.id !== "ODbL-1.0" || !asset.metadata.license.attribution) {
    throw new Error("Geography asset is missing its ODbL attribution");
  }
  if (!Array.isArray(asset.metadata.bounds) || asset.metadata.bounds.length !== 4 || !asset.metadata.bounds.every(Number.isFinite)) {
    throw new Error("Geography asset has invalid bounds");
  }
  if (!Array.isArray(asset.cities) || asset.cities.length < 2 || !Array.isArray(asset.roads) || !Array.isArray(asset.boundary_lines)) {
    throw new Error("Geography asset has incomplete feature collections");
  }
  const regions = new Set(asset.cities.map((city) => city.region));
  if (!regions.has("shenzhen") || !regions.has("hong-kong")) throw new Error("Geography asset is missing a city region");
  for (const city of asset.cities) {
    if (!city.id || !isRegion(city.region) || !hasValidRings(city.geometry)) throw new Error(`City ${city.id ?? "unknown"} has invalid geometry`);
  }
  for (const line of asset.boundary_lines) {
    if (!line.id || !["administrative-outline", "coastline"].includes(line.kind) || !line.coordinates?.every(isFiniteTuple) || line.coordinates.length < 2) {
      throw new Error(`Boundary ${line.id ?? "unknown"} has invalid coordinates`);
    }
  }
  for (const road of asset.roads) {
    if (!isRegion(road.city) || !["motorway", "trunk", "primary"].includes(road.class) || !road.coordinates?.every(isFiniteTuple) || road.coordinates.length < 2) {
      throw new Error(`Road ${road.id} has invalid coordinates`);
    }
  }
}

export async function loadGeographyAsset(signal?: AbortSignal): Promise<GeographyAsset> {
  const response = await fetch(GEOGRAPHY_ASSET_URL, { signal });
  if (!response.ok) throw new Error(`Unable to load offline geography (${response.status})`);
  const asset: unknown = await response.json();
  validateGeographyAsset(asset);
  return asset;
}

export function tupleToGeoCoordinate([lng, lat]: GeoTuple): GeoCoordinate {
  return { lng, lat };
}

function geometryPolygons(geometry: PolygonGeometry | MultiPolygonGeometry): GeoTuple[][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

export function cityPolygonsFromAsset(asset: GeographyAsset): CityPolygon[] {
  return asset.cities.flatMap((city) => geometryPolygons(city.geometry).map((polygon, index) => ({
    id: `${city.id}-${index + 1}`,
    city: city.region,
    points: polygon[0].map(tupleToGeoCoordinate),
  })));
}

export function geographyCoordinates(asset: GeographyAsset): GeoCoordinate[] {
  return asset.cities.flatMap((city) => geometryPolygons(city.geometry).flatMap((polygon) => (
    polygon[0].map(tupleToGeoCoordinate)
  )));
}
