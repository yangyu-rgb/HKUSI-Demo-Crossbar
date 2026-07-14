import {
  BoxGeometry,
  BufferGeometry,
  Color,
  EdgesGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  Shape,
  ShaderMaterial,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BORDER_TRACE, CITY_LABELS, CITY_POLYGONS } from "./geographicData";
import type { GeographyAsset, GeographyRegion, RoadClass } from "./geographyAsset";
import { projectGeoTuple } from "./geoProjection";
import { createLabelSprite, disposeLabelSprite } from "./SceneLabels";
import type { GeoCoordinate, QualityLevel } from "./types";

export type TerrainVisual = {
  group: Group;
  update: (elapsedSeconds: number, motionEnabled: boolean) => void;
  dispose: () => void;
};

type GeoTuple = [lng: number, lat: number];
type PolygonRings = GeoTuple[][];

const ROAD_CLASSES: RoadClass[] = ["primary", "trunk", "motorway"];
const TERRAIN_DEPTH: Record<GeographyRegion, number> = {
  shenzhen: 0.16,
  "hong-kong": 0.13,
};

function terrainSurface(asset?: GeographyAsset): { width: number; depth: number; centerX: number; centerZ: number } {
  if (!asset) return { width: 25.4, depth: 22.4, centerX: 0, centerZ: 0 };
  const [west, south, east, north] = asset.metadata.bounds;
  const [minX, northZ] = projectGeoTuple({ lng: west, lat: north });
  const [maxX, southZ] = projectGeoTuple({ lng: east, lat: south });
  return {
    width: Math.abs(maxX - minX) + 0.8,
    depth: Math.abs(southZ - northZ) + 0.8,
    centerX: (minX + maxX) / 2,
    centerZ: (northZ + southZ) / 2,
  };
}

function toTuple(point: GeoCoordinate): GeoTuple {
  return [point.lng, point.lat];
}

function appendRing(path: Shape | Path, ring: GeoTuple[]): void {
  ring.forEach((point, index) => {
    const [x, z] = projectGeoTuple({ lng: point[0], lat: point[1] });
    if (index === 0) path.moveTo(x, -z);
    else path.lineTo(x, -z);
  });
  path.closePath();
}

function createLandShape(rings: PolygonRings): Shape {
  const shape = new Shape();
  appendRing(shape, rings[0]);
  rings.slice(1).forEach((ring) => {
    const hole = new Path();
    appendRing(hole, ring);
    shape.holes.push(hole);
  });
  return shape;
}

function collectAssetPolygons(asset: GeographyAsset): Record<GeographyRegion, PolygonRings[]> {
  const result: Record<GeographyRegion, PolygonRings[]> = { shenzhen: [], "hong-kong": [] };
  asset.cities.forEach((city) => {
    const polygons = city.geometry.type === "Polygon" ? [city.geometry.coordinates] : city.geometry.coordinates;
    result[city.region].push(...polygons);
  });
  return result;
}

function collectFallbackPolygons(): Record<GeographyRegion, PolygonRings[]> {
  const result: Record<GeographyRegion, PolygonRings[]> = { shenzhen: [], "hong-kong": [] };
  CITY_POLYGONS.forEach((polygon) => result[polygon.city].push([polygon.points.map(toTuple)]));
  return result;
}

function createLandGeometry(polygons: PolygonRings[], depth: number): BufferGeometry | null {
  const geometries = polygons.map((rings) => {
    const geometry = new ExtrudeGeometry(createLandShape(rings), {
      depth,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.018,
      bevelThickness: 0.018,
      curveSegments: 1,
      steps: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  });
  if (geometries.length === 0) return null;
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  return merged;
}

function createSegmentGeometry(lines: GeoTuple[][], elevation: number): BufferGeometry | null {
  const positions: number[] = [];
  lines.forEach((line) => {
    for (let index = 1; index < line.length; index += 1) {
      const start = projectGeoTuple({ lng: line[index - 1][0], lat: line[index - 1][1] });
      const end = projectGeoTuple({ lng: line[index][0], lat: line[index][1] });
      positions.push(start[0], elevation, start[1], end[0], elevation, end[1]);
    }
  });
  if (positions.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createCityTerrain(quality: QualityLevel, geographyAsset?: GeographyAsset): TerrainVisual {
  const group = new Group();
  group.name = "city-terrain";

  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const trackGeometry = <T extends BufferGeometry>(geometry: T): T => {
    geometries.add(geometry);
    return geometry;
  };
  const trackMaterial = <T extends Material>(material: T): T => {
    materials.add(material);
    return material;
  };

  const surface = terrainSurface(geographyAsset);

  const plinthMaterial = trackMaterial(new MeshStandardMaterial({
    color: 0x07111c,
    roughness: 0.88,
    metalness: 0.24,
  }));
  const plinthGeometry = trackGeometry(new BoxGeometry(surface.width, 0.38, surface.depth));
  const plinth = new Mesh(plinthGeometry, plinthMaterial);
  plinth.name = "terrain-plinth";
  plinth.position.set(surface.centerX, -0.3, surface.centerZ);
  plinth.receiveShadow = true;
  group.add(plinth);

  const edgeGeometry = trackGeometry(new EdgesGeometry(plinthGeometry, 30));
  const edgeMaterial = trackMaterial(new LineBasicMaterial({
    color: 0x385065,
    transparent: true,
    opacity: 0.42,
  }));
  const edge = new LineSegments(edgeGeometry, edgeMaterial);
  edge.name = "terrain-plinth-edge";
  edge.position.copy(plinth.position);
  edge.renderOrder = 1;
  group.add(edge);

  const waterMaterial = trackMaterial(new ShaderMaterial({
    transparent: false,
    uniforms: { uTime: { value: 0 }, uMotion: { value: quality === "low" ? 0 : 1 } },
    vertexShader: `
      uniform float uTime;
      uniform float uMotion;
      varying float vWave;
      void main() {
        vec3 transformed = position;
        float wave = (sin(position.x * 0.72 + uTime * 0.34) + cos(position.y * 0.58 - uTime * 0.25)) * 0.012 * uMotion;
        transformed.z += wave;
        vWave = wave;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      varying float vWave;
      void main() {
        vec3 deep = vec3(0.012, 0.038, 0.068);
        vec3 crest = vec3(0.024, 0.082, 0.125);
        gl_FragColor = vec4(mix(deep, crest, clamp(vWave * 26.0 + 0.42, 0.0, 1.0)), 1.0);
      }
    `,
  }));
  const water = new Mesh(
    trackGeometry(new PlaneGeometry(
      surface.width - 0.4,
      surface.depth - 0.4,
      quality === "low" ? 1 : 28,
      quality === "low" ? 1 : 28,
    )),
    waterMaterial,
  );
  water.name = "terrain-water";
  water.rotation.x = -Math.PI / 2;
  water.position.set(surface.centerX, -0.105, surface.centerZ);
  water.receiveShadow = true;
  group.add(water);

  const terrainMaterials: Record<GeographyRegion, MeshStandardMaterial> = {
    shenzhen: trackMaterial(new MeshStandardMaterial({ color: 0x263747, roughness: 0.9, metalness: 0.05 })),
    "hong-kong": trackMaterial(new MeshStandardMaterial({ color: 0x1e2d3b, roughness: 0.93, metalness: 0.04 })),
  };
  const landPolygons = geographyAsset ? collectAssetPolygons(geographyAsset) : collectFallbackPolygons();
  (["shenzhen", "hong-kong"] as GeographyRegion[]).forEach((region) => {
    const geometry = createLandGeometry(landPolygons[region], TERRAIN_DEPTH[region]);
    if (!geometry) return;
    trackGeometry(geometry);
    const mesh = new Mesh(geometry, terrainMaterials[region]);
    mesh.name = `terrain-land-${region}`;
    mesh.position.y = -0.06;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  const boundaryLines = geographyAsset?.boundary_lines ?? [{
    id: "fallback-border",
    kind: "administrative-outline" as const,
    coordinates: BORDER_TRACE.map(toTuple),
  }];
  const boundaryStyles = {
    coastline: { color: new Color("#678398"), opacity: 0.4, elevation: 0.125 },
    "administrative-outline": { color: new Color("#8aa1b4"), opacity: 0.48, elevation: 0.155 },
  } as const;
  (["coastline", "administrative-outline"] as const).forEach((kind) => {
    const geometry = createSegmentGeometry(
      boundaryLines.filter((line) => line.kind === kind).map((line) => line.coordinates),
      boundaryStyles[kind].elevation,
    );
    if (!geometry) return;
    trackGeometry(geometry);
    const material = trackMaterial(new LineBasicMaterial({
      color: boundaryStyles[kind].color,
      transparent: true,
      opacity: boundaryStyles[kind].opacity,
      depthWrite: false,
    }));
    const lines = new LineSegments(geometry, material);
    lines.name = `terrain-boundary-${kind}`;
    lines.renderOrder = kind === "coastline" ? 3 : 4;
    group.add(lines);
  });

  if (geographyAsset) {
    const roadStyles: Record<RoadClass, { color: number; opacity: number; elevation: number }> = {
      primary: { color: 0x607487, opacity: 0.32, elevation: 0.132 },
      trunk: { color: 0x7f96a8, opacity: 0.42, elevation: 0.14 },
      motorway: { color: 0xa1b4c2, opacity: 0.52, elevation: 0.148 },
    };
    ROAD_CLASSES.forEach((roadClass) => {
      const style = roadStyles[roadClass];
      const geometry = createSegmentGeometry(
        geographyAsset.roads.filter((road) => road.class === roadClass).map((road) => road.coordinates),
        style.elevation,
      );
      if (!geometry) return;
      trackGeometry(geometry);
      const material = trackMaterial(new LineBasicMaterial({
        color: style.color,
        transparent: true,
        opacity: style.opacity,
        depthWrite: false,
      }));
      const roads = new LineSegments(geometry, material);
      roads.name = `terrain-road-${roadClass}`;
      roads.renderOrder = 5;
      group.add(roads);
    });
  }

  const labels = CITY_LABELS.map((label) => {
    const sprite = createLabelSprite(label.name, label.nameEn, label.id === "shenzhen" ? "#82d3ff" : "#b4c9db");
    const [x, z] = projectGeoTuple(label.position);
    sprite.position.set(x, 1.65, z);
    sprite.scale.set(2.65, 0.82, 1);
    group.add(sprite);
    return sprite;
  });

  let disposed = false;
  return {
    group,
    update(elapsedSeconds, motionEnabled) {
      waterMaterial.uniforms.uTime.value = elapsedSeconds;
      waterMaterial.uniforms.uMotion.value = motionEnabled && quality !== "low" ? 1 : 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      labels.forEach(disposeLabelSprite);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      group.clear();
    },
  };
}
