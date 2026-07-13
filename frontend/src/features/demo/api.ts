import type { components } from "../../generated/api";
import { request } from "../../shared/api/client";


export type DemoContext = components["schemas"]["DemoContextResponse"];
export type DemoResetResponse = components["schemas"]["DemoResetResponse"];
export type ShadowObservationSummary = components["schemas"]["ShadowObservationSummaryResponse"];
export type V1Model = components["schemas"]["V1ModelResponse"];
export type V1Readiness = components["schemas"]["V1ReadinessResponse"];
export type V2Model = components["schemas"]["V2ModelResponse"];
export type DemoPersonas = components["schemas"]["DemoPersonasResponse"];
export type OperationsSummary = components["schemas"]["OperationsSummaryResponse"];


export function fetchDemoContext(): Promise<DemoContext> {
  return request("/api/demo/context");
}


export function fetchModelShadowSummary(): Promise<ShadowObservationSummary> {
  return request("/api/demo/model-shadow-summary");
}


export function fetchV1Model(): Promise<V1Model> {
  return request("/api/demo/v1-model");
}


export function fetchV1Readiness(): Promise<V1Readiness> {
  return request("/api/demo/v1-readiness");
}


export function fetchV2Model(): Promise<V2Model> {
  return request("/api/demo/v2-model");
}


export function fetchDemoPersonas(): Promise<DemoPersonas> {
  return request("/api/demo/personas");
}


export function fetchOperationsSummary(windowHours = 24): Promise<OperationsSummary> {
  return request(`/api/demo/operations-summary?window_hours=${windowHours}`);
}


export function resetDemo(): Promise<DemoResetResponse> {
  return request("/api/demo/reset", { method: "POST" });
}
