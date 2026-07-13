import { afterEach, describe, expect, it } from "vitest";
import { clearDemoSession, getDemoSession, safeNextPath, setDemoSession } from "./session";

afterEach(() => window.localStorage.clear());

describe("demo session", () => {
  it("stores a typed session and clears both local identity keys", () => {
    setDemoSession({ personaId: "commuter-user", role: "commuter", signedInAt: "2026-07-10T07:45:00+08:00" });
    expect(getDemoSession()?.role).toBe("commuter");
    expect(window.localStorage.getItem("crossborder-demo-persona")).toBe("commuter-user");
    clearDemoSession();
    expect(getDemoSession()).toBeNull();
    expect(window.localStorage.getItem("crossborder-demo-persona")).toBeNull();
  });

  it("rejects malformed sessions and unsafe return paths", () => {
    window.localStorage.setItem("crossborder-demo-session", "not-json");
    expect(getDemoSession()).toBeNull();
    expect(safeNextPath("?next=%2Fplanner%3Fmode%3Dfast", "/")).toBe("/planner?mode=fast");
    expect(safeNextPath("?next=https%3A%2F%2Fexample.com", "/")).toBe("/");
    expect(safeNextPath("?next=%2F%2Fevil.example", "/mobile")).toBe("/mobile");
    expect(safeNextPath("?next=%2Flogin", "/")).toBe("/");
  });
});
