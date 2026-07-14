#!/usr/bin/env node

/**
 * Build the offline Hong Kong / Shenzhen geography asset used by the 3D scene.
 *
 * Source data remains © OpenStreetMap contributors and is distributed under
 * ODbL 1.0. This script deliberately writes a small, presentation-oriented
 * derivative: city outlines plus a curated subset of major roads.
 *
 * Reproducible refresh (replace the epoch with the intended UTC build time):
 *   SOURCE_DATE_EPOCH=1783900800 npm run generate:geography -- --refresh
 * Re-running without --refresh uses the cached source snapshot; pairing that
 * snapshot with the same SOURCE_DATE_EPOCH produces byte-identical JSON.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

const ROOT = resolve(import.meta.dirname, "..");
const OUTPUT = resolve(ROOT, "public/data/hk-shenzhen-geography.json");
const CACHE_DIR = resolve(ROOT, ".cache/osm-geography");
const BOUNDS = [113.75, 22.15, 114.45, 22.78]; // west, south, east, north
const SIMPLIFICATION_TOLERANCE = 0.00055;
const ROAD_LIMITS = { motorway: 28, trunk: 42, primary: 54 };
const COASTLINE_LIMIT = 96;
const NOMINATIM_ENDPOINT = process.env.NOMINATIM_ENDPOINT ?? "https://nominatim.openstreetmap.org";
const OVERPASS_ENDPOINT = process.env.OVERPASS_ENDPOINT ?? "https://overpass-api.de/api/interpreter";
const USER_AGENT = process.env.OSM_USER_AGENT ?? "HKUSI-demo-geography-builder/1.0 (offline visualization asset)";
const REFRESH = process.argv.includes("--refresh");

if (process.argv.includes("--help")) {
  console.log(`Usage: npm run generate:geography -- [--refresh]\n\nEnvironment:\n  SOURCE_DATE_EPOCH  UTC build time used for deterministic generated_at\n  NOMINATIM_ENDPOINT / OVERPASS_ENDPOINT  optional source mirrors\n  OSM_USER_AGENT     contact-bearing OpenStreetMap request user agent`);
  process.exit(0);
}

// Fixed OSM relation IDs prevent search ranking changes from silently changing
// the rendered land. Whole-city administrative polygons are intentionally not
// used because both cities' jurisdiction polygons include large sea areas.
const landRequests = [
  { id: "shenzhen-nanshan", osmId: 5664195, region: "shenzhen", name: "南山区 / Nanshan" },
  { id: "shenzhen-futian", osmId: 5664191, region: "shenzhen", name: "福田区 / Futian" },
  { id: "shenzhen-luohu", osmId: 5664194, region: "shenzhen", name: "罗湖区 / Luohu" },
  { id: "shenzhen-yantian", osmId: 5663273, region: "shenzhen", name: "盐田区 / Yantian" },
  { id: "hong-kong-lantau", osmId: 3676782, region: "hong-kong", name: "大屿山 / Lantau" },
  { id: "hong-kong-island", osmId: 10264792, region: "hong-kong", name: "香港岛 / Hong Kong Island" },
  { id: "hong-kong-yuen-long", osmId: 8480823, region: "hong-kong", name: "元朗区 / Yuen Long" },
  { id: "hong-kong-north", osmId: 9159733, region: "hong-kong", name: "北区 / North" },
  { id: "hong-kong-tai-po", osmId: 9159737, region: "hong-kong", name: "大埔区 / Tai Po" },
  { id: "hong-kong-sha-tin", osmId: 8477820, region: "hong-kong", name: "沙田区 / Sha Tin" },
  { id: "hong-kong-sai-kung", osmId: 8189562, region: "hong-kong", name: "西贡区 / Sai Kung" },
  { id: "hong-kong-tuen-mun", osmId: 8480494, region: "hong-kong", name: "屯门区 / Tuen Mun" },
  { id: "hong-kong-tsuen-wan", osmId: 8368100, region: "hong-kong", name: "荃湾区 / Tsuen Wan" },
  { id: "hong-kong-kwai-tsing", osmId: 7351646, region: "hong-kong", name: "葵青区 / Kwai Tsing" },
];

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function compareIds(a, b) {
  return String(a.id).localeCompare(String(b.id), "en");
}

async function fetchJsonCached(cacheName, url, init = {}) {
  const cachePath = resolve(CACHE_DIR, cacheName);
  if (!REFRESH) {
    try {
      return JSON.parse(await readFile(cachePath, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...init.headers },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  const json = await response.json();
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(json)}\n`);
  return json;
}

function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function simplifyLine(points, tolerance = SIMPLIFICATION_TOLERANCE) {
  if (points.length <= 2) return points.map(([lng, lat]) => [round(lng), round(lat)]);
  let maxDistance = 0;
  let splitIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistance(points[index], points[0], points.at(-1));
    if (distance > maxDistance) {
      splitIndex = index;
      maxDistance = distance;
    }
  }
  if (maxDistance <= tolerance) return [points[0], points.at(-1)].map(([lng, lat]) => [round(lng), round(lat)]);
  return [
    ...simplifyLine(points.slice(0, splitIndex + 1), tolerance).slice(0, -1),
    ...simplifyLine(points.slice(splitIndex), tolerance),
  ];
}

function sameCoordinate(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function clipRingToEdge(points, inside, intersect) {
  const output = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[(index + points.length - 1) % points.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside) {
      if (!previousInside) output.push(intersect(previous, current));
      output.push(current);
    } else if (previousInside) {
      output.push(intersect(previous, current));
    }
  }
  return output;
}

function clipPolygonRing(input) {
  const [west, south, east, north] = BOUNDS;
  const source = input.length > 1 && sameCoordinate(input[0], input.at(-1)) ? input.slice(0, -1) : input;
  const vertical = (x) => (a, b) => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
  const horizontal = (y) => (a, b) => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];
  let points = clipRingToEdge(source, ([x]) => x >= west, vertical(west));
  points = clipRingToEdge(points, ([, y]) => y >= south, horizontal(south));
  points = clipRingToEdge(points, ([x]) => x <= east, vertical(east));
  points = clipRingToEdge(points, ([, y]) => y <= north, horizontal(north));
  if (points.length < 3) return [];
  const simplified = simplifyLine([...points, points[0]]);
  if (!sameCoordinate(simplified[0], simplified.at(-1))) simplified.push(simplified[0]);
  return simplified.length >= 4 ? simplified : [];
}

function ringArea(ring) {
  return Math.abs(ring.reduce((area, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2);
}

function normalizeGeometry(geometry) {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    throw new Error(`Expected Polygon or MultiPolygon, received ${geometry?.type ?? "nothing"}`);
  }
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const clipped = polygons
    .map((polygon) => polygon.map(clipPolygonRing).filter((ring) => ring.length >= 4))
    .filter((polygon) => polygon.length > 0 && ringArea(polygon[0]) > 0.000001)
    .sort((a, b) => ringArea(b[0]) - ringArea(a[0]));
  if (!clipped.length) throw new Error("City geometry is outside the configured bounds");
  return clipped.length === 1
    ? { type: "Polygon", coordinates: clipped[0] }
    : { type: "MultiPolygon", coordinates: clipped };
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point, geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(([outer, ...holes]) => pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole)));
}

function clipSegment(a, b) {
  const [west, south, east, north] = BOUNDS;
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - west], [dx, east - a[0]], [-dy, a[1] - south], [dy, north - a[1]]]) {
    if (p === 0 && q < 0) return null;
    if (p === 0) continue;
    const ratio = q / p;
    if (p < 0) t0 = Math.max(t0, ratio);
    else t1 = Math.min(t1, ratio);
    if (t0 > t1) return null;
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}

function clipLine(points) {
  const lines = [];
  let current = [];
  for (let index = 1; index < points.length; index += 1) {
    const clipped = clipSegment(points[index - 1], points[index]);
    if (!clipped) {
      if (current.length >= 2) lines.push(current);
      current = [];
      continue;
    }
    if (!current.length || !sameCoordinate(current.at(-1), clipped[0])) {
      if (current.length >= 2) lines.push(current);
      current = [clipped[0]];
    }
    current.push(clipped[1]);
  }
  if (current.length >= 2) lines.push(current);
  return lines;
}

function lineLength(points) {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    const latitudeScale = Math.cos(((point[1] + previous[1]) / 2) * Math.PI / 180);
    return total + Math.hypot((point[0] - previous[0]) * latitudeScale, point[1] - previous[1]);
  }, 0);
}

function buildRoads(elements, cities) {
  const candidates = elements.flatMap((element) => {
    if (element.type !== "way" || !element.geometry || !(element.tags?.highway in ROAD_LIMITS)) return [];
    const source = element.geometry.map(({ lon, lat }) => [lon, lat]);
    return clipLine(source).map((coordinates, segmentIndex) => {
      const simplified = simplifyLine(coordinates);
      const midpoint = simplified[Math.floor(simplified.length / 2)];
      const city = cities.find((entry) => pointInGeometry(midpoint, entry.geometry));
      return {
        id: `osm-way-${element.id}-${segmentIndex}`,
        name: element.tags.name ?? element.tags["name:en"] ?? undefined,
        class: element.tags.highway,
        city: city?.region ?? (midpoint[1] >= 22.525 ? "shenzhen" : "hong-kong"),
        coordinates: simplified,
        _score: lineLength(simplified) * (element.tags.name ? 1.35 : 1),
      };
    });
  });
  const selected = [];
  for (const roadClass of Object.keys(ROAD_LIMITS)) {
    selected.push(...candidates
      .filter((road) => road.class === roadClass)
      .sort((a, b) => b._score - a._score || compareIds(a, b))
      .slice(0, ROAD_LIMITS[roadClass]));
  }
  return selected
    .map(({ _score, ...road }) => road)
    .sort((a, b) => a.class.localeCompare(b.class, "en") || compareIds(a, b));
}

function buildBoundaryLines(cities, elements) {
  const administrative = cities.flatMap((city) => {
    const polygons = city.geometry.type === "Polygon" ? [city.geometry.coordinates] : city.geometry.coordinates;
    return polygons.map((polygon, index) => ({
      id: `${city.id}-outline-${index + 1}`,
      region: city.region,
      kind: "administrative-outline",
      coordinates: polygon[0],
    }));
  });
  const coastlines = elements
    .filter((element) => element.type === "way" && element.tags?.natural === "coastline" && element.geometry)
    .flatMap((element) => clipLine(element.geometry.map(({ lon, lat }) => [lon, lat])).map((coordinates, index) => ({
      id: `osm-coastline-${element.id}-${index}`,
      kind: "coastline",
      coordinates: simplifyLine(coordinates, SIMPLIFICATION_TOLERANCE * 0.7),
      _score: lineLength(coordinates),
    })))
    .sort((a, b) => b._score - a._score || compareIds(a, b))
    .slice(0, COASTLINE_LIMIT)
    .map(({ _score, ...line }) => line);
  return [...administrative, ...coastlines].sort(compareIds);
}

function generatedAt() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  return new Date(epoch ? Number(epoch) * 1000 : Date.now()).toISOString();
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  const relationIds = landRequests.map(({ osmId }) => `R${osmId}`);
  const params = new URLSearchParams({ osm_ids: relationIds.join(","), format: "geojson", polygon_geojson: "1", polygon_threshold: "0" });
  const nominatimUrl = `${NOMINATIM_ENDPOINT}/lookup?${params}`;
  const nominatim = await fetchJsonCached("nominatim-fixed-land-relations.json", nominatimUrl);
  const featuresById = new Map((nominatim.features ?? []).map((feature) => [Number(feature.properties?.osm_id), feature]));
  const cities = landRequests.map((request) => {
    const feature = featuresById.get(request.osmId);
    if (!feature) throw new Error(`Nominatim returned no result for relation R${request.osmId} (${request.name})`);
    return {
      id: request.id,
      region: request.region,
      name: request.name,
      osm: { type: feature.properties?.osm_type, id: feature.properties?.osm_id },
      geometry: normalizeGeometry(feature.geometry),
    };
  });

  const [west, south, east, north] = BOUNDS;
  const overpassQuery = `[out:json][timeout:90];(way["highway"~"^(motorway|trunk|primary)$"](${south},${west},${north},${east});way["natural"="coastline"](${south},${west},${north},${east}););out tags geom;`;
  const overpass = await fetchJsonCached("overpass-roads-coastline.json", OVERPASS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: overpassQuery }).toString(),
  });

  const asset = {
    schema_version: 1,
    metadata: {
      title: "Hong Kong–Shenzhen offline 3D geography",
      source: [
        { provider: "OpenStreetMap Nominatim", endpoint: NOMINATIM_ENDPOINT, usage: "fixed district and island relation polygons", osm_relation_ids: relationIds },
        { provider: "OpenStreetMap Overpass API", endpoint: OVERPASS_ENDPOINT, usage: "selected major roads and coastline ways", query: overpassQuery },
      ],
      license: {
        name: "Open Data Commons Open Database License 1.0",
        id: "ODbL-1.0",
        url: "https://opendatacommons.org/licenses/odbl/1-0/",
        attribution: "© OpenStreetMap contributors",
        attribution_url: "https://www.openstreetmap.org/copyright",
      },
      generated_at: generatedAt(),
      source_snapshot_at: overpass.osm3s?.timestamp_osm_base ?? null,
      bounds: BOUNDS,
      coordinate_order: "longitude-latitude",
      simplification: { algorithm: "Douglas-Peucker", tolerance_degrees: SIMPLIFICATION_TOLERANCE },
      road_limits: ROAD_LIMITS,
      disclaimer: "Simplified visualization data; not suitable for surveying or navigation.",
    },
    cities: cities.sort(compareIds),
    boundary_lines: buildBoundaryLines(cities, overpass.elements ?? []),
    roads: buildRoads(overpass.elements ?? [], cities),
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(asset)}\n`);
  const bytes = Buffer.byteLength(JSON.stringify(asset));
  console.log(`Wrote ${OUTPUT}`);
  console.log(`${asset.cities.length} cities, ${asset.boundary_lines.length} outlines, ${asset.roads.length} roads, ${bytes} bytes`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
