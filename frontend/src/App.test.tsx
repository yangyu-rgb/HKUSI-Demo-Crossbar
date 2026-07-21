import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "./App";


const locations = {
  origins: [
    { id: "hku", name: "香港大学", city: "香港" },
    { id: "central", name: "中环", city: "香港" },
    { id: "kowloon-tong", name: "九龙塘", city: "香港" },
  ],
  destinations: [
    { id: "nanshan-tech", name: "深圳南山科技园", city: "深圳" },
    { id: "futian-cbd", name: "深圳福田CBD", city: "深圳" },
  ],
  directions: [
    {
      id: "hong_kong_to_shenzhen",
      label: "香港 → 深圳",
      origin_ids: ["hku", "central", "kowloon-tong"],
      destination_ids: ["nanshan-tech", "futian-cbd"],
    },
    {
      id: "shenzhen_to_hong_kong",
      label: "深圳 → 香港",
      origin_ids: ["nanshan-tech", "futian-cbd"],
      destination_ids: ["hku", "central", "kowloon-tong"],
    },
  ],
};

const context = {
  current_time: "2026-07-10T07:45:00+08:00",
  timezone: "Asia/Hong_Kong",
  min_target_time: "2026-07-10T08:00:00+08:00",
  suggested_target_time: "2026-07-10T09:45:00+08:00",
  max_target_time: "2026-07-11T07:45:00+08:00",
  poll_interval_seconds: 60,
};

const prediction = {
  query: {
    origin_id: "hku",
    origin_name: "香港大学",
    destination_id: "nanshan-tech",
    destination_name: "深圳南山科技园",
    target_time: "2026-07-10T09:45:00+08:00",
    priority: "balanced",
    max_budget: 100,
  },
  ports: [
    {
      port_id: "futian",
      name: "福田",
      name_en: "Futian",
      predicted_wait_time: 18,
      confidence_interval: [14, 22],
      risk_level: "low",
      late_risk_percent: 12,
      total_time: 84,
      total_cost: 49,
      estimated_arrival: "2026-07-10T09:09:00+08:00",
      latest_departure: "2026-07-10T07:56:00+08:00",
      buffer_minutes: 21,
      on_time: true,
      within_budget: true,
      crowdsource_enhanced: true,
      crowdsource_count: 1,
      route: {
        steps: [
          { mode: "mtr", label: "香港大学 → 福田", duration: 39, cost: 43 },
          { mode: "border", label: "福田口岸通关", duration: 18, cost: 0 },
          { mode: "metro", label: "福田 → 深圳南山科技园", duration: 27, cost: 6 },
        ],
      },
      anomalies: [],
      factors: [
        {
          code: "historical_calendar",
          label: "时间匹配历史基线",
          value_minutes: 18,
          effective_weight: 0.6,
        },
      ],
      historical_sample_count: 42,
      uncertainty_minutes: 3.2,
      prediction_engine: "v2",
      scenario_delta_minutes: 1.5,
      official_calibration: {
        status: "active",
        source: "demo",
        feature_version: "v1",
        calibration_version: "v1",
        traffic: { pressure: 0.42, expected_count: 120, baseline_count: 100, distribution: { status: "in_distribution" } },
        queue: { resident_level: "low", visitor_level: "medium", effective_weight: 0.65, age_minutes: 4 },
        shenzhen_validation: { available: true, agreement_percent: 88, uncertainty_multiplier: 0.95, reason: "双侧一致" },
        raw_model_wait_minutes: 16,
        scenario_adjusted_wait_minutes: 17,
        queue_adjusted_wait_minutes: 18,
        crowdsource_adjustment_minutes: 0,
        calibrated_wait_minutes: 18,
        uncertainty_minutes: 3.2,
      },
    },
  ],
  recommended: "福田",
  recommended_port_id: "futian",
  reason: "福田在当前偏好下综合最优。",
  warnings: [],
  generated_at: "2026-07-10T07:45:00+08:00",
  model_version: "time-weighted-statistical-demo-v2",
  confidence_level: 0.9,
  demo_notice: "本地确定性演示。",
};

function json(payload: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
}

function renderRoute(path: string, role: "operator" | "commuter" | "business_admin" | "transport_dispatcher" | "port_official" | null | undefined = undefined) {
  window.localStorage.clear();
  const resolvedRole = role === undefined ? (path.startsWith("/mobile") ? "commuter" : "operator") : role;
  if (resolvedRole) {
    const personaId = resolvedRole === "operator"
      ? "demo-user"
      : resolvedRole === "commuter"
        ? "commuter-user"
        : resolvedRole === "transport_dispatcher"
          ? "coach-dispatcher"
          : resolvedRole === "port_official"
            ? "port-official"
            : "enterprise-admin";
    window.localStorage.setItem("crossborder-demo-session", JSON.stringify({ personaId, role: resolvedRole, signedInAt: "2026-07-10T07:45:00+08:00" }));
    window.localStorage.setItem("crossborder-demo-persona", personaId);
  }
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("application routes", () => {
  it("redirects a guest from a protected desktop route to login", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/demo/personas")) return json({ default_persona_id: "demo-user", personas: [] });
      throw new Error(`Unexpected request: ${String(input)}`);
    }));
    renderRoute("/planner", null);
    expect(await screen.findByRole("heading", { name: "Choose your workspace" })).toBeInTheDocument();
  });

  it("shows a permission explanation instead of leaking an enterprise page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("not needed")));
    renderRoute("/business", "commuter");
    expect(await screen.findByRole("heading", { name: "This persona cannot access this feature" })).toBeInTheDocument();
    expect(screen.getByText(/enterprise administrator/)).toBeInTheDocument();
  });

  it("redirects a guest to the dedicated mobile login", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/demo/personas")) return json({ default_persona_id: "demo-user", personas: [] });
      throw new Error(`Unexpected request: ${String(input)}`);
    }));
    renderRoute("/mobile", null);
    expect(await screen.findByRole("heading", { name: "Personal commute workspace" })).toBeInTheDocument();
  });

  it("keeps mobile planning inside the independent mobile application", async () => {
    const mobilePrediction = {
      ...prediction,
      direction: "hong_kong_to_shenzhen",
      forecast_run_id: "mobile-run-1",
      prediction_engine: "v2",
      scenario: {},
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/locations")) return json(locations);
      if (url.endsWith("/api/demo/context")) return json(context);
      if (url.endsWith("/api/predict") && init?.method === "POST") return json(mobilePrediction);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute("/mobile/planner");
    expect(await screen.findByRole("heading", { name: "Plan a cross-border journey" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).not.toBeInTheDocument();
    const mobileNavigation = screen.getByRole("navigation", { name: "Mobile quick navigation" });
    expect(mobileNavigation.querySelector('a[href="/planner"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Generate AI recommendation" }));
    expect(await screen.findByText("Recommendation · The University of Hong Kong → Shenzhen Nanshan Technology Park")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Report actual wait after crossing" })).toHaveAttribute("href", expect.stringContaining("/mobile/feedback"));
  });

  it("loads the enterprise operations control tower without changing the page shell", async () => {
    const scenario = {
      id: "holiday-peak",
      preset_id: "holiday-peak",
      name: "Holiday Peak / 节假日高峰",
      weather: "clear",
      is_holiday: true,
      events: [],
      port_constraints: {},
      subtitle: "What-if stress test",
      scenario_at: "2026-04-30T07:00:00+08:00",
      problem_evidence: "Official operating evidence.",
      problem_source_url: "https://example.com/evidence",
    };
    const aiDecisionTrace = {
      model_available: true,
      coverage_status: "full",
      model_supported_port_count: 4,
      total_port_count: 4,
      model_version: "public-traffic-transparent-hgb-v2.2",
      prediction_engine: "HGB base forecast + transparent stress calibration + constraint optimizer",
      target_time: "2026-04-30T08:00:00+08:00",
      forecast_horizon_hours: 3,
      confidence_level: 0.9,
      inputs: ["port and direction"],
      optimization_objectives: ["minimize high-risk service tasks"],
      ports: [],
      disclosure: "Classroom estimate only.",
    };
    const workspace = {
      generated_at: "2026-04-30T07:00:00+08:00",
      workspace_kind: "coach_operator",
      organization_name: "港深跨境客运 Demo",
      available_views: ["coach_operator", "freight_operator", "enterprise_client", "port_authority"],
      scenarios: [scenario],
      active_scenario: scenario,
      ports: [
        { id: "luohu", name: "罗湖", wait_minutes: 44, confidence_interval: [41, 47], forecast_source: "checked-in HGB model", risk: "high" },
        { id: "futian", name: "福田", wait_minutes: 20, confidence_interval: [18, 22], forecast_source: "checked-in HGB model", risk: "low" },
      ],
      assets: [],
      jobs: [],
      recent_plans: [],
      coordination_notices: [],
      ai_decision_trace: aiDecisionTrace,
      demo_notice: "所有班次、车辆、等待、风险、金额与通知均为课堂重建情景。",
      scenario_presets: [scenario],
      sample_jobs: [{
        id: "101", label: "Service #101", job_kind: "coach", asset_id: "A01",
        origin_id: "central", destination_id: "futian-cbd",
        departure_time: "2026-04-30T07:40:00+08:00", arrival_deadline: "2026-04-30T09:35:00+08:00",
        baseline_port_id: "luohu", passenger_count: 49, load_units: 0, asset_capacity: 53,
        asset_available_at: "2026-04-30T07:00:00+08:00", turnaround_minutes: 20,
        exposure_hkd: 4000, priority: "urgent",
      }],
      locations: {
        origins: [{ id: "central", name: "中环" }],
        destinations: [{ id: "futian-cbd", name: "深圳福田 CBD" }],
      },
      csv_columns: ["id"],
    };
    const preview = {
      preview_id: "preview-test",
      workspace_kind: "coach_operator",
      scenario,
      baseline: { total_jobs: 1, high_risk_count: 7, medium_risk_count: 0, vehicle_conflicts: 1, cost_exposure_hkd: 24000, average_arrival_delta_minutes: 0, affected_people: 0, affected_load_units: 0, changed_jobs: 0 },
      recommended: { total_jobs: 1, high_risk_count: 0, medium_risk_count: 0, vehicle_conflicts: 0, cost_exposure_hkd: 0, average_arrival_delta_minutes: 8, affected_people: 49, affected_load_units: 0, changed_jobs: 1 },
      jobs: [
        {
          id: "101", label: "Service #101", direction: "hong_kong_to_shenzhen", asset_id: "A01", recommended_asset_id: "A01",
          passenger_count: 49, load_units: 0, baseline_port_id: "luohu", baseline_port: "Lo Wu",
          baseline_departure_time: "2026-04-30T07:40:00+08:00", baseline_arrival: "2026-04-30T09:41:00+08:00", baseline_risk: "high",
          recommended_port_id: "luohu", recommended_port: "Lo Wu", recommended_departure_time: "2026-04-30T07:30:00+08:00",
          recommended_arrival: "2026-04-30T09:25:00+08:00", recommended_risk: "medium", changed: true, arrival_delta_minutes: -16,
          exposure_before_hkd: 4000, exposure_after_hkd: 2000, predicted_wait_minutes: 45, prediction_interval: [40, 50], model_source: "checked-in HGB model",
        },
        {
          id: "104", label: "Service #104", direction: "shenzhen_to_hong_kong", asset_id: "A04", recommended_asset_id: "A04",
          passenger_count: 38, load_units: 0, baseline_port_id: "huanggang", baseline_port: "Huanggang",
          baseline_departure_time: "2026-04-30T08:05:00+08:00", baseline_arrival: "2026-04-30T10:10:00+08:00", baseline_risk: "high",
          recommended_port_id: "shenzhen-bay", recommended_port: "Shenzhen Bay", recommended_departure_time: "2026-04-30T08:05:00+08:00",
          recommended_arrival: "2026-04-30T09:40:00+08:00", recommended_risk: "low", changed: true, arrival_delta_minutes: -30,
          exposure_before_hkd: 3000, exposure_after_hkd: 0, predicted_wait_minutes: 22, prediction_interval: [18, 26], model_source: "checked-in HGB model",
        },
      ],
      actions: [{ id: "reroute-101", action_type: "reroute", target_id: "101", title: "班次 #101 改走福田", detail: "提前 10 分钟发车", impact: "降低延误风险" }],
      ai_decision_trace: aiDecisionTrace,
      explanation: ["提前一小时识别罗湖压力。"],
      demo_notice: "课堂情景结果，不保证真实零延误。",
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/enterprise-operations/workspace")) return json(workspace);
      if (url.includes("/api/enterprise-operations/plans?limit=10")) return json({ plans: [], total: 0 });
      if (url.includes("/api/enterprise-operations/previews") && init?.method === "POST") return json(preview);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute("/business");

    expect(await screen.findByRole("heading", { name: "Enterprise Predictive Dispatch" })).toBeInTheDocument();
    expect(screen.getByText("No operating data loaded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load Demo Sample" }));
    expect(screen.getByText(/1 validated Demo tasks loaded/)).toBeInTheDocument();
    for (const port of ["Lo Wu", "Futian", "Huanggang", "Shenzhen Bay"]) {
      const checkbox = screen.getByRole("checkbox", { name: port });
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
    }
    const loWuCheckbox = screen.getByRole("checkbox", { name: "Lo Wu" });
    fireEvent.click(loWuCheckbox);
    expect(loWuCheckbox).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Analyse Selected Scenario" }));
    expect(await screen.findByText("7→0")).toBeInTheDocument();
    expect(screen.getByText("24,000→0")).toBeInTheDocument();
    expect(screen.getByText("07:40 → 07:30")).toBeInTheDocument();
    expect(screen.getByText(/Departure 10 min earlier/)).toBeInTheDocument();
    expect(screen.getByText("08:05", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/Departure unchanged/)).toBeInTheDocument();
    expect(screen.queryByText("08:05 → 08:05")).not.toBeInTheDocument();
    expect(screen.queryByText("30 min earlier")).not.toBeInTheDocument();
  });

  it("applies the demo time window and submits changed prediction input", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/locations")) return json(locations);
      if (url.endsWith("/api/demo/context")) return json(context);
      if (url.endsWith("/api/predict")) return json(prediction);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute("/planner");
    expect(await screen.findByRole("heading", { name: "Select trip conditions to generate a four-port plan" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/predict"))).toHaveLength(0);
    const target = screen.getByLabelText("Latest arrival");
    expect(target).toHaveAttribute("min", "2026-07-10T08:00");
    expect(target).toHaveAttribute("max", "2026-07-11T07:45");
    expect(target).toHaveValue("2026-07-10T09:45");
    expect(screen.getByText("Hong Kong time")).toBeInTheDocument();

    const origin = screen.getByRole("combobox", { name: "Origin" });
    fireEvent.change(origin, { target: { value: "Central" } });
    fireEvent.click(screen.getByRole("option", { name: /Central/ }));
    fireEvent.click(screen.getByRole("button", { name: "Generate AI recommendation" }));

    await waitFor(() => {
      const predictionCalls = fetchMock.mock.calls.filter(
        ([input]) => String(input).endsWith("/api/predict"),
      );
      expect(predictionCalls).toHaveLength(1);
      const requestInit = predictionCalls[0][1] as RequestInit;
      expect(JSON.parse(String(requestInit.body)).origin_id).toBe("central");
    });
    expect(await screen.findByText("Recommended route")).toBeInTheDocument();

    const calculationTrigger = screen.getByRole("button", { name: "View full calculation" });
    fireEvent.click(calculationTrigger);
    expect(await screen.findByRole("dialog", { name: "Futian Port · Full calculation" })).toBeInTheDocument();
    expect(screen.getByText("88% pressure agreement")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close calculation" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.change(target, { target: { value: "2026-07-10T10:00" } });
    expect(screen.queryByText("Recommended route")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Select trip conditions to generate a four-port plan" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generate AI recommendation" }));
    expect(await screen.findByText("Recommended route")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear plan" }));
    expect(screen.queryByText("Recommended route")).not.toBeInTheDocument();
    expect(target).toHaveValue("2026-07-10T10:00");
  });

  it("shows a useful planner error when bootstrap fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderRoute("/planner");

    expect(await screen.findByRole("heading", { name: "Unable to load route planning" })).toBeInTheDocument();
    expect(screen.getByText("Unable to connect to the server. Check that the backend is running.")).toBeInTheDocument();
  });

  it("shows report quality and explains duplicate crowdsource rejection", async () => {
    const realtime = {
      timestamp: "2026-07-10T07:45:00+08:00",
      source: "test",
      ports: [{
        id: "futian",
        name: "福田",
        name_en: "Futian",
        current_wait: 14,
        status: "open",
        crowd_level: "low",
        special_channels: ["学生通道开放"],
        passenger_flow: "畅通",
        forecast: [
          { offset_minutes: 0, wait: 14 },
          { offset_minutes: 60, wait: 17 },
        ],
        anomalies: [],
        crowdsource_count: 1,
      }],
      alerts: [],
    };
    const feed = {
      reports: [{
        id: "report-1",
        user_id: "student",
        port: "福田",
        actual_wait_time: 13,
        crowd_level: "low",
        comment: "通关顺畅",
        timestamp: "2026-07-10T07:40:00+08:00",
        time_label: "5分钟前",
        quality_score: 95,
        quality_level: "high",
        expires_at: "2026-07-10T09:10:00+08:00",
        used_for_prediction: true,
      }],
      total: 1,
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/realtime")) return json(realtime);
      if (url.endsWith("/api/crowdsource/feed")) return json(feed);
      if (url.endsWith("/api/crowdsource/report") && init?.method === "POST") {
        return json({
          error: {
            code: "DUPLICATE_REPORT",
            message: "同一口岸反馈提交过于频繁，请在10分钟后重试",
            details: { retry_after_minutes: 10 },
            request_id: "req-duplicate",
          },
        }, 409);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute("/crowdsource");
    expect(await screen.findByText("High confidence · score 95")).toBeInTheDocument();
    expect(screen.getByText("Valid until 09:10")).toBeInTheDocument();

    expect(screen.getByText("Classroom Demo data")).toBeInTheDocument();
    expect(screen.getByText(/15%, 30%, and 45% caps/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Actual wait/), { target: { value: "14" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(await screen.findByText("Reports for the same port are too frequent. Try again in 10 minutes."))
      .toBeInTheDocument();
    const reportCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith("/api/crowdsource/report") && init?.method === "POST",
    );
    const reportBody = JSON.parse(String(reportCall?.[1]?.body));
    expect(reportBody.is_real_observation).toBeUndefined();
    expect(reportBody.training_consent).toBeUndefined();
    expect(reportBody.direction).toBe("hong_kong_to_shenzhen");
    expect(reportBody.channel).toBe("traveller");
  });

  it("edits and deletes a persisted alert subscription", async () => {
    let subscriptions = [{
      subscription_id: "sub-1",
      user_id: "demo-user",
      routine: {
        origin_id: "hku",
        destination_id: "nanshan-tech",
        days: ["monday", "wednesday", "friday"],
        arrival_deadline: "09:30",
        priority: "balanced",
      },
      alerts: {
        advance_reminder: true,
        anomaly_alert: true,
        better_route_alert: true,
      },
      created_at: "2026-07-10T07:45:00+08:00",
      updated_at: "2026-07-10T07:45:00+08:00",
      next_alert: "周一 09:00",
      message: null,
    }];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/locations")) return json(locations);
      if (url.includes("/api/subscriptions?")) {
        return json({ subscriptions, total: subscriptions.length });
      }
      if (url.endsWith("/api/subscriptions/sub-1") && init?.method === "PATCH") {
        const payload = JSON.parse(String(init.body));
        subscriptions = [{ ...subscriptions[0], ...payload }];
        return json(subscriptions[0]);
      }
      if (url.endsWith("/api/subscriptions/sub-1") && init?.method === "DELETE") {
        subscriptions = [];
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderRoute("/alerts");
    expect(await screen.findByText("The University of Hong Kong → Shenzhen Nanshan Technology Park")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Route preference"), { target: { value: "fastest" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Subscription updated.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByText("0 total")).toBeInTheDocument());
    expect(fetchMock.mock.calls.some(
      ([input, init]) => String(input).endsWith("/api/subscriptions/sub-1") && init?.method === "DELETE",
    )).toBe(true);
  });
});
