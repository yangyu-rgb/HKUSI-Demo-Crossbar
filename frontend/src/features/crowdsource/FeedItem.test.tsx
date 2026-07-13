import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeedItem } from "./FeedItem";
import type { CrowdsourceReport } from "./types";


describe("FeedItem", () => {
  it("renders untrusted comments as text instead of markup", () => {
    const marker = "<script>alert('demo')</script>";
    const report = {
      id: "security", user_id: "tester", port: "福田",
      actual_wait_time: 14, crowd_level: "low", comment: marker,
      timestamp: "2026-07-10T07:45:00+08:00", time_label: "刚刚",
      quality_score: 95, quality_level: "high",
      expires_at: "2026-07-10T09:15:00+08:00",
      used_for_prediction: true, source_type: "demo_entry",
      direction: "hong_kong_to_shenzhen", channel: "traveller",
      forecast_run_id: null, forecast_port_id: null,
    } as unknown as CrowdsourceReport;
    const { container } = render(<FeedItem report={report} />);
    expect(screen.getByText(marker)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it("explains reports excluded from prediction", () => {
    const report = {
      id: "low", user_id: "tester", port: "罗湖", actual_wait_time: 80,
      crowd_level: "high", comment: "分歧样本", timestamp: "2026-07-10T07:45:00+08:00",
      time_label: "刚刚", quality_score: 30, quality_level: "low",
      expires_at: "2026-07-10T09:15:00+08:00", used_for_prediction: false,
      source_type: "demo_entry", direction: "hong_kong_to_shenzhen", channel: "traveller",
    } as unknown as CrowdsourceReport;
    render(<FeedItem report={report} />);
    expect(screen.getByText(/不参与预测/)).toBeInTheDocument();
    expect(screen.getByText(/低可信 30分/)).toBeInTheDocument();
  });
});
