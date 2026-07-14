import type { BorderRouteGeography, GeoCoordinate } from "./types";

export type CityPolygon = {
  id: string;
  city: "shenzhen" | "hong-kong";
  points: GeoCoordinate[];
};

// 离线简化轮廓用于演示空间关系，不作为测绘或导航数据。
export const CITY_POLYGONS: CityPolygon[] = [
  {
    id: "shenzhen-main",
    city: "shenzhen",
    points: [
      { lng: 113.79, lat: 22.49 }, { lng: 113.82, lat: 22.62 }, { lng: 113.92, lat: 22.70 },
      { lng: 114.06, lat: 22.69 }, { lng: 114.18, lat: 22.73 }, { lng: 114.34, lat: 22.68 },
      { lng: 114.38, lat: 22.57 }, { lng: 114.30, lat: 22.54 }, { lng: 114.22, lat: 22.55 },
      { lng: 114.12, lat: 22.53 }, { lng: 114.08, lat: 22.52 }, { lng: 114.03, lat: 22.51 },
      { lng: 113.95, lat: 22.50 }, { lng: 113.88, lat: 22.53 },
    ],
  },
  {
    id: "new-territories",
    city: "hong-kong",
    points: [
      { lng: 113.91, lat: 22.48 }, { lng: 113.96, lat: 22.51 }, { lng: 114.04, lat: 22.50 },
      { lng: 114.10, lat: 22.52 }, { lng: 114.18, lat: 22.53 }, { lng: 114.29, lat: 22.51 },
      { lng: 114.34, lat: 22.43 }, { lng: 114.28, lat: 22.35 }, { lng: 114.20, lat: 22.31 },
      { lng: 114.11, lat: 22.32 }, { lng: 114.04, lat: 22.34 }, { lng: 113.98, lat: 22.38 },
      { lng: 113.92, lat: 22.41 },
    ],
  },
  {
    id: "lantau",
    city: "hong-kong",
    points: [
      { lng: 113.82, lat: 22.31 }, { lng: 113.90, lat: 22.34 }, { lng: 114.00, lat: 22.31 },
      { lng: 114.05, lat: 22.25 }, { lng: 114.00, lat: 22.20 }, { lng: 113.90, lat: 22.19 },
      { lng: 113.84, lat: 22.23 },
    ],
  },
  {
    id: "hong-kong-island",
    city: "hong-kong",
    points: [
      { lng: 114.11, lat: 22.30 }, { lng: 114.19, lat: 22.31 }, { lng: 114.25, lat: 22.27 },
      { lng: 114.22, lat: 22.22 }, { lng: 114.14, lat: 22.21 }, { lng: 114.09, lat: 22.25 },
    ],
  },
];

export const CITY_LABELS = [
  { id: "shenzhen", name: "深圳", nameEn: "SHENZHEN", position: { lng: 114.01, lat: 22.63 } },
  { id: "hong-kong", name: "香港", nameEn: "HONG KONG", position: { lng: 114.14, lat: 22.31 } },
] as const;

export const BORDER_TRACE: GeoCoordinate[] = [
  { lng: 113.91, lat: 22.49 }, { lng: 113.96, lat: 22.505 }, { lng: 114.04, lat: 22.505 },
  { lng: 114.10, lat: 22.522 }, { lng: 114.18, lat: 22.535 }, { lng: 114.29, lat: 22.515 },
];

export const BORDER_ROUTE_GEOGRAPHY: Record<string, BorderRouteGeography> = {
  "shenzhen-bay": {
    id: "shenzhen-bay",
    position: { lng: 113.944, lat: 22.503 },
    route: [
      { lng: 113.86, lat: 22.60 }, { lng: 113.90, lat: 22.55 }, { lng: 113.944, lat: 22.503 },
      { lng: 113.965, lat: 22.465 }, { lng: 114.02, lat: 22.405 }, { lng: 114.10, lat: 22.34 },
    ],
    labelOffset: [-1.2, 1.45, 0.15],
  },
  huanggang: {
    id: "huanggang",
    position: { lng: 114.073, lat: 22.521 },
    route: [
      { lng: 114.035, lat: 22.66 }, { lng: 114.055, lat: 22.59 }, { lng: 114.073, lat: 22.521 },
      { lng: 114.076, lat: 22.47 }, { lng: 114.10, lat: 22.405 }, { lng: 114.12, lat: 22.34 },
    ],
    labelOffset: [-1.25, 1.75, 0],
  },
  futian: {
    id: "futian",
    position: { lng: 114.069, lat: 22.514 },
    route: [
      { lng: 114.12, lat: 22.66 }, { lng: 114.09, lat: 22.59 }, { lng: 114.069, lat: 22.514 },
      { lng: 114.083, lat: 22.46 }, { lng: 114.14, lat: 22.405 }, { lng: 114.17, lat: 22.34 },
    ],
    labelOffset: [1.1, 1.25, 0.1],
  },
  luohu: {
    id: "luohu",
    position: { lng: 114.114, lat: 22.527 },
    route: [
      { lng: 114.26, lat: 22.66 }, { lng: 114.18, lat: 22.59 }, { lng: 114.114, lat: 22.527 },
      { lng: 114.13, lat: 22.475 }, { lng: 114.19, lat: 22.405 }, { lng: 114.20, lat: 22.33 },
    ],
    labelOffset: [1.25, 1.5, 0],
  },
};

export const DEFAULT_ROUTE_ORDER = ["shenzhen-bay", "huanggang", "futian", "luohu"];
