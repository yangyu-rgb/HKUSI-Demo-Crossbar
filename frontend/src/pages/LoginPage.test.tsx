import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";

afterEach(() => { window.localStorage.clear(); vi.unstubAllGlobals(); });

describe("LoginPage", () => {
  it("selects a local workspace and records the demo session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ default_persona_id: "demo-user", personas: [
      { id: "demo-user", name: "Demo 操作员", role: "operator", organization_id: "demo-org", organization_name: "演示公司" },
      { id: "commuter-user", name: "跨境通勤者", role: "commuter", organization_id: "personal", organization_name: "个人空间" },
    ] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/login?next=%2Fplanner"]}><Routes><Route path="login" element={<LoginPage />} /><Route path="planner" element={<h1>已返回路线规划</h1>} /></Routes></MemoryRouter></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /跨境通勤者/ }));
    fireEvent.click(screen.getByRole("button", { name: /进入 CrossBorder AI/ }));
    expect(await screen.findByRole("heading", { name: "已返回路线规划" })).toBeInTheDocument();
    expect(window.localStorage.getItem("crossborder-demo-persona")).toBe("commuter-user");
    expect(window.localStorage.getItem("crossborder-demo-session")).toContain("commuter-user");
  });
});
