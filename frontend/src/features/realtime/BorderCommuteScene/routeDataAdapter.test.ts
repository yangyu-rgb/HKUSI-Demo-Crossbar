import { describe, expect, it } from "vitest";
import type { PortStatus } from "../types";
import { CONGESTION_CONFIG, congestionLevelForWait } from "./congestionConfig";
import { BORDER_ROUTE_GEOGRAPHY } from "./geographicData";
import { projectGeo } from "./geoProjection";
import { normalizeRouteStatus, normalizeRouteStatuses } from "./routeDataAdapter";

function port(id: string, name: string, currentWait: number): PortStatus {
  return {
    id,
    name,
    name_en: name,
    map_position: { x: 0, y: 0 },
    current_wait: currentWait,
    status: "open",
    crowd_level: "low",
    special_channels: [],
    passenger_flow: "normal",
    forecast: [],
    anomalies: [],
    crowdsource_count: 0,
    trend: "stable",
    change_next_hour: 0,
    peak_wait: currentWait,
    peak_at: "2026-07-13T12:00:00+08:00",
  };
}

describe("border route data adapter", () => {
  it("maps wait time to four stable congestion levels", () => {
    expect([0, 17, 18, 34, 35, 49, 50, 90].map(congestionLevelForWait)).toEqual([
      "smooth", "smooth", "normal", "normal", "crowded", "crowded", "severe", "severe",
    ]);
  });

  it("keeps density increasing and speed decreasing with congestion", () => {
    const levels = ["smooth", "normal", "crowded", "severe"] as const;
    const density = levels.map((level) => CONGESTION_CONFIG[level].particleDensity);
    const speed = levels.map((level) => CONGESTION_CONFIG[level].particleSpeed);
    const queueStrength = levels.map((level) => CONGESTION_CONFIG[level].queueStrength);
    expect(density).toEqual([...density].sort((left, right) => left - right));
    expect(speed).toEqual([...speed].sort((left, right) => right - left));
    expect(queueStrength).toEqual([...queueStrength].sort((left, right) => left - right));
  });

  it("uses stable route ids and independent geographic configuration", () => {
    const statuses = normalizeRouteStatuses([
      port("luohu", "罗湖", 42), port("shenzhen-bay", "深圳湾", 12),
      port("futian", "福田", 28), port("huanggang", "皇岗", 55),
    ]);
    expect(statuses.map((status) => status.id)).toEqual(["shenzhen-bay", "huanggang", "futian", "luohu"]);
    expect(statuses.every((status) => status.route === BORDER_ROUTE_GEOGRAPHY[status.id].route)).toBe(true);
  });

  it("falls back safely when numeric data is invalid", () => {
    const invalid = port("futian", "福田", Number.NaN);
    const status = normalizeRouteStatus(invalid);
    expect(status.waitingTime).toBe(0);
    expect(status.congestionLevel).toBe("smooth");
  });

  it("projects Shenzhen north of Hong Kong and ports west-to-east", () => {
    const shenzhen = projectGeo({ lng: 114.05, lat: 22.63 });
    const hongKong = projectGeo({ lng: 114.14, lat: 22.31 });
    expect(shenzhen.z).toBeLessThan(hongKong.z);
    expect(projectGeo(BORDER_ROUTE_GEOGRAPHY["shenzhen-bay"].position).x)
      .toBeLessThan(projectGeo(BORDER_ROUTE_GEOGRAPHY.luohu.position).x);
  });
});
