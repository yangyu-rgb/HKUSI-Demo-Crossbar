import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationsPage } from "./OperationsPage";


afterEach(() => { cleanup(); vi.unstubAllGlobals(); });


describe("OperationsPage", () => {
  it("shows deterministic operational metrics", async () => {
    const payload = {
      generated_at: "2026-07-10T07:45:00+08:00", window_hours: 24,
      forecast: { total_runs: 4, engine_counts: { v2_2_transparent_hybrid: 3, statistical_fallback: 1 }, port_evaluations: {}, hourly_runs: [] },
      crowdsource: { active_reports: 4, used_for_prediction: 3, distinct_reporters: 3, average_quality_score: 88, quality_counts: { high: 2, medium: 1, low: 1 }, linked_feedback_count: 1 },
      errors: { total: 1, by_code: { VALIDATION_ERROR: 1 }, by_path: {}, recent: [] },
      audit: { total: 2, by_path: { "/api/predict": 2 }, recent: [] },
      adapters: { database: "sqlite-local", database_ready: true, identity: "demo-persona", notifications: "sqlite-inbox", providers: [{ provider: "ports", status: "available", fallback: false }, { provider: "weather", status: "fallback", fallback: true }] },
    };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }),
    )));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OperationsPage /></QueryClientProvider>);
    expect(await screen.findByRole("heading", { name: "Demo 运营分析中心" })).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("AI v2.2")).toBeInTheDocument();
    expect(screen.getByText("统计降级")).toBeInTheDocument();
    expect(screen.getByText("VALIDATION_ERROR")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "7天" }));
    expect(await screen.findByText("最近7天")).toBeInTheDocument();
  });

  it("shows the normalized API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "FORBIDDEN", message: "仅运营人员可查看", details: {}, request_id: "req-1", category: "permission", retryable: false, user_action: "请切换身份" },
    }), { status: 403, headers: { "Content-Type": "application/json" } })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OperationsPage /></QueryClientProvider>);
    expect(await screen.findByRole("heading", { name: "无法载入运营分析" })).toBeInTheDocument();
    expect(screen.getByText("仅运营人员可查看")).toBeInTheDocument();
  });
});
