import type { PortStatus } from "../types";
import { congestionLevelForWait } from "./congestionConfig";
import { BORDER_ROUTE_GEOGRAPHY, DEFAULT_ROUTE_ORDER } from "./geographicData";
import type { BorderRouteGeography, NormalizedRouteStatus } from "./types";

const FALLBACK_GEOGRAPHY: BorderRouteGeography = BORDER_ROUTE_GEOGRAPHY.futian;

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeRouteStatus(port: PortStatus): NormalizedRouteStatus {
  const geography = BORDER_ROUTE_GEOGRAPHY[port.id] ?? FALLBACK_GEOGRAPHY;
  const waitingTime = Math.max(0, Math.round(safeNumber(port.current_wait, 0)));
  return {
    id: port.id,
    name: port.name || port.id,
    nameEn: port.name_en || port.id,
    congestionLevel: congestionLevelForWait(waitingTime),
    waitingTime,
    queueCount: Math.max(0, Math.round(waitingTime * 3.2)),
    route: geography.route,
    position: geography.position,
    labelOffset: geography.labelOffset,
  };
}

export function normalizeRouteStatuses(ports: PortStatus[]): NormalizedRouteStatus[] {
  const statuses = ports.map(normalizeRouteStatus);
  const order = new Map(DEFAULT_ROUTE_ORDER.map((id, index) => [id, index]));
  return statuses.sort((left, right) => (order.get(left.id) ?? 99) - (order.get(right.id) ?? 99));
}
