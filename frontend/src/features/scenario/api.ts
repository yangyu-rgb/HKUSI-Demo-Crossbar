import { request } from "../../shared/api/client";


export type ScenarioWeather = "clear" | "rain" | "heavy_rain" | "thunderstorm";
export type ScenarioEvent = { name: string; preset: string; direction: "hong_kong_to_shenzhen" | "shenzhen_to_hong_kong" | null; affected_ports: string[]; start_time: string; end_time: string; impact: "low" | "medium" | "high" };
export type ScenarioWrite = { weather: ScenarioWeather; is_holiday: boolean; events: ScenarioEvent[] };
export type ScenarioDay = ScenarioWrite & { date: string; version: string; is_override: boolean };
export type ScenarioList = { start: string; days: number; scenarios: ScenarioDay[]; weather_options: ScenarioWeather[]; event_presets: Record<string, unknown>[] };


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
