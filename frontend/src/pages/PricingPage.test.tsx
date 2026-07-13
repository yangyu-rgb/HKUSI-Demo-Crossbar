import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PricingPage } from "./PricingPage";

afterEach(() => { window.localStorage.clear(); vi.unstubAllGlobals(); });

describe("PricingPage", () => {
  it("shows plans and completes checkout without collecting payment details", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/commercial/plans")) return Promise.resolve(new Response(JSON.stringify({ plans: [{ id: "professional", name: "Professional", audience: "团队", monthly_price_hkd: 399, yearly_price_hkd: 3990, description: "商业方案", features: ["运营分析"], highlighted: true }], demo_notice: "本地演示" }), { status: 200, headers: { "Content-Type": "application/json" } }));
      if (url.endsWith("/api/commercial/subscription") && !init?.method) return Promise.resolve(new Response(JSON.stringify({ subscription: null, demo_notice: "本地演示" }), { status: 200, headers: { "Content-Type": "application/json" } }));
      if (url.endsWith("/api/commercial/checkout")) return Promise.resolve(new Response(JSON.stringify({ success: true, subscription: { account_id: "demo-org", persona_id: "demo-user", organization_id: "demo-org", plan_id: "professional", plan_name: "Professional", billing_cycle: "yearly", status: "active", price_hkd: 3990, started_at: "2026-07-10T07:45:00+08:00", renews_at: "2027-07-10T07:45:00+08:00", receipt_id: "demo-receipt-1", demo_payment: true }, message: "完成" }), { status: 200, headers: { "Content-Type": "application/json" } }));
      throw new Error(`Unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("crossborder-demo-session", JSON.stringify({ personaId: "demo-user", role: "operator", signedInAt: "2026-07-10T07:45:00+08:00" }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><PricingPage /></MemoryRouter></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "模拟购买" }));
    expect(screen.getByText(/不会收集银行卡/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认模拟结账" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/commercial/checkout"), expect.objectContaining({ method: "POST" })));
  });
});
