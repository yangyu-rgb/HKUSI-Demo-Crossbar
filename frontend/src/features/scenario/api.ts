import { request } from "../../shared/api/client";
import type { components } from "../../generated/api";


export type ScenarioWeather = "clear" | "rain" | "heavy_rain" | "thunderstorm";
export type ScenarioEvent = { name: string; preset: string; direction: "hong_kong_to_shenzhen" | "shenzhen_to_hong_kong" | null; affected_ports: string[]; start_time: string; end_time: string; impact: "low" | "medium" | "high" };
export type ScenarioWrite = { weather: ScenarioWeather; is_holiday: boolean; events: ScenarioEvent[] };
export type ScenarioDay = ScenarioWrite & { date: string; version: string; is_override: boolean };
export type ScenarioList = { start: string; days: number; scenarios: ScenarioDay[]; weather_options: ScenarioWeather[]; event_presets: Record<string, unknown>[] };
export type ScenarioComparisonRequest = {
  origin_id: string;
  destination_id: string;
  target_time: string;
  preferences: { priority: "balanced" | "fastest" | "cheapest"; max_budget: number | null };
  scenario: ScenarioWrite;
};
export type ScenarioComparison = {
  baseline: components["schemas"]["PredictionResponse"];
  candidate: components["schemas"]["PredictionResponse"];
  recommended_changed: boolean;
  baseline_recommended_port_id: string;
  candidate_recommended_port_id: string;
  ports: Array<{
    port_id: string;
    port_name: string;
    baseline_wait_minutes: number;
    candidate_wait_minutes: number;
    wait_delta_minutes: number;
    baseline_late_risk_percent: number;
    candidate_late_risk_percent: number;
    late_risk_delta_percent: number;
    total_time_delta_minutes: number;
  }>;
};


export function fetchScenarios(): Promise<ScenarioList> {
  return request("/api/demo/scenarios?days=14");
}


export function saveScenario(date: string, payload: ScenarioWrite): Promise<ScenarioDay> {
  return request(`/api/demo/scenarios/${date}`, { method: "PUT", body: JSON.stringify(payload) });
}


export function restoreScenario(date: string): Promise<ScenarioDay> {
  return request(`/api/demo/scenarios/${date}`, { method: "DELETE" });
}


export function resetScenarios(): Promise<{ success: boolean; scenarios: ScenarioDay[] }> {
  return request("/api/demo/scenarios/reset", { method: "POST" });
}


export function compareScenarios(payload: ScenarioComparisonRequest): Promise<ScenarioComparison> {
  return request("/api/demo/scenarios/compare", { method: "POST", body: JSON.stringify(payload) });
}
