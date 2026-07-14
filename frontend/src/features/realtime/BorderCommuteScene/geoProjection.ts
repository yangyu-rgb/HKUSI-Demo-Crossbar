import { Vector3 } from "three";
import type { GeoCoordinate } from "./types";

export const GEO_CENTER: GeoCoordinate = { lng: 114.065, lat: 22.445 };
const SCENE_SCALE = 36;
const LONGITUDE_CORRECTION = Math.cos(GEO_CENTER.lat * Math.PI / 180);

export function projectGeo(point: GeoCoordinate, elevation = 0): Vector3 {
  return new Vector3(
    (point.lng - GEO_CENTER.lng) * SCENE_SCALE * LONGITUDE_CORRECTION,
    elevation,
    (GEO_CENTER.lat - point.lat) * SCENE_SCALE,
  );
}

export function projectGeoTuple(point: GeoCoordinate): [number, number] {
  const projected = projectGeo(point);
  return [projected.x, projected.z];
}
