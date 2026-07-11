import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ForecastHeatmap } from "./ForecastHeatmap";
import type { RealtimeResponse } from "./types";


function port(id: string, name: string, waits: number[]) {
  return {
    id, name, name_en: name, current_wait: waits[0], status: "open",
    crowd_level: waits[0] >= 35 ? "high" : waits[0] >= 18 ? "medium" : "low",
    special_channels: ["测试通道"], passenger_flow: "畅通", anomalies: [],
    crowdsource_count: 1, trend: waits[1] - waits[0] >= 3 ? "rising" : "stable",
    change_next_hour: waits[1] - waits[0], peak_wait: Math.max(...waits),
    peak_at: "2026-07-10T10:00:00+08:00",
    forecast: waits.map((wait, index) => ({ offset_minutes: index * 60, forecast_at: `2026-07-10T${String(8 + index).padStart(2, "0")}:00:00+08:00`, wait, lower_bound: wait - 3, upper_bound: wait + 3, change_from_now: wait - waits[0] })),
  };
}


describe("ForecastHeatmap", () => {
  it("marks each time slice best port and surfaces overview insights", () => {
    const ports = [port("luohu", "罗湖", [20, 24, 28, 30]), port("futian", "福田", [12, 14, 18, 19]), port("huanggang", "皇岗", [36, 42, 45, 48]), port("shenzhen-bay", "深圳湾", [16, 18, 17, 15])];
    const data = { timestamp: "2026-07-10T08:00:00+08:00", source: "test", data_sources: [], alerts: [], ports, overview: { smoothest_port_id: "futian", smoothest_port_name: "福田", smoothest_wait: 12, highest_pressure_port_id: "huanggang", highest_pressure_port_name: "皇岗", highest_pressure_wait: 36, fastest_rising_port_id: "huanggang", fastest_rising_port_name: "皇岗", fastest_rising_change: 6, active_anomaly_count: 0, crowdsource_report_count: 4 } } as unknown as RealtimeResponse;
    render(<ForecastHeatmap data={data} />);
    expect(screen.getByText("当前最优").parentElement).toHaveTextContent("福田");
    expect(screen.getByText("三小时后最优").parentElement).toHaveTextContent("深圳湾");
    expect(screen.getAllByText("★ 最佳")).toHaveLength(4);
    expect(screen.getByText("最大变化风险").parentElement).toHaveTextContent("皇岗");
  });
});
