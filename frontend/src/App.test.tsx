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

function renderRoute(path: string) {
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("application routes", () => {
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
    expect(await screen.findByRole("heading", { name: "规划跨境行程" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "主要导航" })).not.toBeInTheDocument();
    const mobileNavigation = screen.getByRole("navigation", { name: "移动快捷导航" });
    expect(mobileNavigation.querySelector('a[href="/planner"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "生成 AI 建议" }));
    expect(await screen.findByText("本次推荐 · 香港大学 → 深圳南山科技园")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "通关后反馈实际等待" })).toHaveAttribute("href", expect.stringContaining("/mobile/feedback"));
  });

  it("loads the editable business page directly", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/locations")) return json(locations);
      if (url.endsWith("/api/demo/context")) return json(context);
      if (url.includes("/api/batch/plans")) return json({ plans: [], total: 0 });
      if (url.endsWith("/api/batch") && init?.method === "POST") {
        const request = JSON.parse(String(init.body));
        return json({
          plan_id: "plan-test",
          company: request.company,
          date: request.date,
          plan: request.employees.map((employee: { id: string }) => ({
            employee_id: employee.id,
            recommended_port: "福田",
            departure_time: "08:00",
            total_time: 80,
            late_risk_percent: 10,
          })),
          summary: {
            employee_count: request.employees.length,
            avg_commute_time: 80,
            high_risk_count: 0,
            recommendation: "建议统一经福田出发。",
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute("/business");

    expect(await screen.findByRole("heading", { name: "企业批量通勤风险管理" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "删除" })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "+ 添加员工" }));
    expect(screen.getByLabelText("员工5姓名")).toHaveValue("员工105");
    fireEvent.click(screen.getByRole("button", { name: "生成调度方案" }));

    expect(await screen.findByText("建议统一经福田出发。")).toBeInTheDocument();
    const batchCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith("/api/batch") && init?.method === "POST",
    );
    expect(JSON.parse(String(batchCall?.[1]?.body)).employees).toHaveLength(5);
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
    await screen.findByText("本次推荐");
    const target = screen.getByLabelText("最迟到达");
    expect(target).toHaveAttribute("min", "2026-07-10T08:00");
    expect(target).toHaveAttribute("max", "2026-07-11T07:45");
    expect(target).toHaveValue("2026-07-10T09:45");
    expect(screen.getByText("香港时间")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("出发地"), { target: { value: "central" } });
    fireEvent.click(screen.getByRole("button", { name: "生成 AI 建议" }));

    await waitFor(() => {
      const predictionCalls = fetchMock.mock.calls.filter(
        ([input]) => String(input).endsWith("/api/predict"),
      );
      expect(predictionCalls).toHaveLength(2);
      const requestInit = predictionCalls[1][1] as RequestInit;
      expect(JSON.parse(String(requestInit.body)).origin_id).toBe("central");
    });
  });

  it("shows a useful planner error when bootstrap fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderRoute("/planner");

    expect(await screen.findByRole("heading", { name: "无法载入路线规划" })).toBeInTheDocument();
    expect(screen.getByText("无法连接服务器，请检查后端是否已启动。")).toBeInTheDocument();
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
    expect(await screen.findByText("高可信 95分")).toBeInTheDocument();
    expect(screen.getByText("有效至 09:10")).toBeInTheDocument();

    expect(screen.getByText("课堂 Demo 数据")).toBeInTheDocument();
    expect(screen.getByText(/最多以30%权重影响当前预测/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/实际等待/), { target: { value: "14" } });
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    expect(await screen.findByText("同一口岸反馈提交过于频繁，请在10分钟后重试"))
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
    expect(await screen.findByText("香港大学 → 深圳南山科技园")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("路线偏好"), { target: { value: "fastest" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    expect(await screen.findByText("订阅已更新。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() => expect(screen.getByText("0 条")).toBeInTheDocument());
    expect(fetchMock.mock.calls.some(
      ([input, init]) => String(input).endsWith("/api/subscriptions/sub-1") && init?.method === "DELETE",
    )).toBe(true);
  });
});
