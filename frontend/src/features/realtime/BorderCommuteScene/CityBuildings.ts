import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  MeshStandardMaterial,
  Object3D,
  Vector2,
} from "three";
import { CITY_POLYGONS } from "./geographicData";
import type { CityPolygon } from "./geographicData";
import { projectGeo } from "./geoProjection";
import { QUALITY_CONFIG } from "./congestionConfig";
import type { GeoCoordinate, QualityLevel } from "./types";

type BuildingArchetype = "low-rise" | "slab-tower" | "tapered-tower" | "stepped-landmark";

type BuildingInstance = {
  color: Color;
  matrix: Object3D["matrix"];
};

type LandmarkDefinition = {
  archetype: "tapered-tower" | "stepped-landmark";
  city: CityPolygon["city"];
  color: string;
  footprint: number;
  height: number;
  position: GeoCoordinate;
  rotation: number;
};

const ARCHETYPE_ORDER: readonly BuildingArchetype[] = [
  "low-rise",
  "slab-tower",
  "tapered-tower",
  "stepped-landmark",
];

// 方位剪影只承担城市识别，不追求真实建筑复刻或测绘精度。
const LANDMARKS: readonly LandmarkDefinition[] = [
  {
    archetype: "stepped-landmark",
    city: "shenzhen",
    color: "#93aabd",
    footprint: 1.05,
    height: 2.25,
    position: { lng: 114.057, lat: 22.54 },
    rotation: Math.PI * 0.08,
  },
  {
    archetype: "stepped-landmark",
    city: "hong-kong",
    color: "#a1aebc",
    footprint: 0.9,
    height: 1.62,
    position: { lng: 114.158, lat: 22.285 },
    rotation: -Math.PI * 0.08,
  },
  {
    archetype: "tapered-tower",
    city: "shenzhen",
    color: "#819bb1",
    footprint: 1.12,
    height: 1.72,
    position: { lng: 114.11, lat: 22.55 },
    rotation: Math.PI * 0.16,
  },
  {
    archetype: "tapered-tower",
    city: "hong-kong",
    color: "#8997a7",
    footprint: 0.98,
    height: 1.46,
    position: { lng: 114.164, lat: 22.303 },
    rotation: Math.PI * 0.12,
  },
];

const LANDMARK_COUNT: Record<QualityLevel, number> = {
  low: 2,
  medium: 3,
  high: 4,
};

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let current = value;
    current = Math.imul(current ^ current >>> 15, current | 1);
    current ^= current + Math.imul(current ^ current >>> 7, current | 61);
    return ((current ^ current >>> 14) >>> 0) / 4294967296;
  };
}

function insidePolygon(point: GeoCoordinate, polygon: readonly GeoCoordinate[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects = (a.lat > point.lat) !== (b.lat > point.lat)
      && point.lng < (b.lng - a.lng) * (point.lat - a.lat) / (b.lat - a.lat) + a.lng;
    if (intersects) inside = !inside;
  }
  return inside;
}

function createSteppedLandmarkGeometry(): LatheGeometry {
  const profile = [
    new Vector2(0.15, -0.5),
    new Vector2(0.15, -0.26),
    new Vector2(0.125, -0.26),
    new Vector2(0.125, 0.02),
    new Vector2(0.095, 0.02),
    new Vector2(0.095, 0.27),
    new Vector2(0.052, 0.27),
    new Vector2(0.052, 0.44),
    new Vector2(0, 0.5),
  ];
  return new LatheGeometry(profile, 8);
}

function createArchetypeGeometries(): Record<BuildingArchetype, BufferGeometry> {
  return {
    "low-rise": new BoxGeometry(0.26, 1, 0.3),
    "slab-tower": new BoxGeometry(0.19, 1, 0.32),
    "tapered-tower": new CylinderGeometry(0.1, 0.15, 1, 6),
    "stepped-landmark": createSteppedLandmarkGeometry(),
  };
}

function createArchetypeMaterials(): Record<BuildingArchetype, MeshStandardMaterial> {
  return {
    "low-rise": new MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.84,
      metalness: 0.05,
      emissive: "#102033",
      emissiveIntensity: 0.2,
    }),
    "slab-tower": new MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.72,
      metalness: 0.12,
      emissive: "#14283a",
      emissiveIntensity: 0.28,
    }),
    "tapered-tower": new MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.64,
      metalness: 0.18,
      emissive: "#142b3d",
      emissiveIntensity: 0.3,
    }),
    "stepped-landmark": new MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.58,
      metalness: 0.2,
      emissive: "#193247",
      emissiveIntensity: 0.34,
    }),
  };
}

function squaredDistance(a: GeoCoordinate, b: GeoCoordinate): number {
  const lng = a.lng - b.lng;
  const lat = a.lat - b.lat;
  return lng * lng + lat * lat;
}

function isInBusinessDistrict(city: CityPolygon["city"], point: GeoCoordinate): boolean {
  const centre = city === "shenzhen"
    ? { lng: 114.064, lat: 22.545 }
    : { lng: 114.163, lat: 22.295 };
  const radius = city === "shenzhen" ? 0.082 : 0.062;
  return squaredDistance(point, centre) < radius * radius;
}

function selectArchetype(random: () => number, inBusinessDistrict: boolean): BuildingArchetype {
  const roll = random();
  if (inBusinessDistrict) {
    if (roll < 0.44) return "slab-tower";
    if (roll < 0.72) return "tapered-tower";
    return "low-rise";
  }
  if (roll < 0.72) return "low-rise";
  if (roll < 0.91) return "slab-tower";
  return "tapered-tower";
}

function buildingHeight(
  archetype: BuildingArchetype,
  city: CityPolygon["city"],
  inBusinessDistrict: boolean,
  random: () => number,
): number {
  if (archetype === "low-rise") return 0.18 + random() * 0.42;
  if (archetype === "slab-tower") {
    const cityBoost = city === "shenzhen" ? 0.16 : 0.08;
    return 0.58 + cityBoost + random() * 0.72 + (inBusinessDistrict ? 0.28 : 0);
  }
  return 0.62 + random() * 0.82 + (inBusinessDistrict ? 0.2 : 0);
}

function buildingColor(
  archetype: BuildingArchetype,
  city: CityPolygon["city"],
  random: () => number,
): Color {
  const base = archetype === "low-rise"
    ? (city === "shenzhen" ? "#6f8498" : "#788493")
    : (city === "shenzhen" ? "#7892a8" : "#8794a3");
  return new Color(base).offsetHSL(0, 0, (random() - 0.5) * 0.12);
}

function addInstance(
  instances: Record<BuildingArchetype, BuildingInstance[]>,
  archetype: BuildingArchetype,
  dummy: Object3D,
  color: Color,
): void {
  dummy.updateMatrix();
  instances[archetype].push({ color, matrix: dummy.matrix.clone() });
}

function createMeshes(
  quality: QualityLevel,
  instances: Record<BuildingArchetype, BuildingInstance[]>,
  geometries: Record<BuildingArchetype, BufferGeometry>,
  materials: Record<BuildingArchetype, MeshStandardMaterial>,
): InstancedMesh[] {
  const meshes: InstancedMesh[] = [];
  ARCHETYPE_ORDER.forEach((archetype) => {
    const archetypeInstances = instances[archetype];
    if (archetypeInstances.length === 0) return;
    const mesh = new InstancedMesh(geometries[archetype], materials[archetype], archetypeInstances.length);
    mesh.name = `instanced-city-buildings-${archetype}`;
    mesh.castShadow = quality === "high" && archetype !== "low-rise";
    mesh.receiveShadow = true;
    archetypeInstances.forEach((instance, index) => {
      mesh.setMatrixAt(index, instance.matrix);
      mesh.setColorAt(index, instance.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    meshes.push(mesh);
  });
  return meshes;
}

export type BuildingVisual = { group: Group; dispose: () => void };

export function createCityBuildings(
  quality: QualityLevel,
  polygons: readonly CityPolygon[] = CITY_POLYGONS,
): BuildingVisual {
  const group = new Group();
  group.name = "city-buildings";
  const budget = QUALITY_CONFIG[quality].buildingCount;
  const geometries = createArchetypeGeometries();
  const materials = createArchetypeMaterials();
  const instances: Record<BuildingArchetype, BuildingInstance[]> = {
    "low-rise": [],
    "slab-tower": [],
    "tapered-tower": [],
    "stepped-landmark": [],
  };
  const availableCities = new Set(polygons.map((polygon) => polygon.city));
  const landmarks = LANDMARKS
    .filter((landmark) => availableCities.has(landmark.city))
    .slice(0, LANDMARK_COUNT[quality]);
  const ordinaryBuildingBudget = Math.max(0, budget - landmarks.length);
  const random = seededRandom(2612);
  const dummy = new Object3D();
  let created = 0;
  let attempts = 0;

  while (created < ordinaryBuildingBudget && attempts < ordinaryBuildingBudget * 25 && polygons.length > 0) {
    attempts += 1;
    const city = random() > 0.48 ? "shenzhen" : "hong-kong";
    const candidates = polygons.filter((polygon) => polygon.city === city && polygon.points.length >= 3);
    if (candidates.length === 0) continue;
    const polygon = candidates[Math.floor(random() * candidates.length)];
    const lngValues = polygon.points.map((point) => point.lng);
    const latValues = polygon.points.map((point) => point.lat);
    const point = {
      lng: Math.min(...lngValues) + random() * (Math.max(...lngValues) - Math.min(...lngValues)),
      lat: Math.min(...latValues) + random() * (Math.max(...latValues) - Math.min(...latValues)),
    };
    if (!insidePolygon(point, polygon.points)) continue;

    const projected = projectGeo(point);
    const inBusinessDistrict = isInBusinessDistrict(city, point);
    const archetype = selectArchetype(random, inBusinessDistrict);
    const footprint = 0.62 + random() * 0.72;
    const height = buildingHeight(archetype, city, inBusinessDistrict, random);
    dummy.position.set(projected.x, height * 0.5 + 0.12, projected.z);
    dummy.scale.set(footprint, height, footprint * (0.74 + random() * 0.42));
    dummy.rotation.set(0, random() * Math.PI, 0);
    addInstance(instances, archetype, dummy, buildingColor(archetype, city, random));
    created += 1;
  }

  landmarks.forEach((landmark) => {
    const projected = projectGeo(landmark.position);
    dummy.position.set(projected.x, landmark.height * 0.5 + 0.12, projected.z);
    dummy.scale.set(landmark.footprint, landmark.height, landmark.footprint);
    dummy.rotation.set(0, landmark.rotation, 0);
    addInstance(instances, landmark.archetype, dummy, new Color(landmark.color));
  });

  const meshes = createMeshes(quality, instances, geometries, materials);
  meshes.forEach((mesh) => group.add(mesh));
  let disposed = false;

  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      meshes.forEach((mesh) => mesh.dispose());
      ARCHETYPE_ORDER.forEach((archetype) => {
        geometries[archetype].dispose();
        materials[archetype].dispose();
      });
    },
  };
}
