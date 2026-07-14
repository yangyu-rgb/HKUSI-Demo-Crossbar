import { describe, expect, it, vi } from "vitest";
import { RouteAutoTour } from "./RouteAutoTour";

describe("RouteAutoTour", () => {
  it("resumes only after the unified interaction idle window", () => {
    const onFocus = vi.fn();
    const tour = new RouteAutoTour(["a", "b"], onFocus, 100, 200);
    tour.start(0);
    tour.pauseFor(8000, 50);

    tour.update(8049);
    expect(onFocus).not.toHaveBeenCalled();
    expect(tour.isPaused(8049)).toBe(true);

    tour.update(8050);
    expect(onFocus).toHaveBeenLastCalledWith("a");
    expect(tour.isPaused(8050)).toBe(false);
  });

  it("extends an active pause and clears it when disabled", () => {
    const onFocus = vi.fn();
    const tour = new RouteAutoTour(["a"], onFocus);
    tour.start(0);
    tour.pauseFor(8000, 100);
    tour.pauseFor(8000, 1000);
    expect(tour.isPaused(8999)).toBe(true);
    expect(tour.isPaused(9000)).toBe(false);

    tour.setEnabled(false);
    expect(tour.isPaused(2000)).toBe(false);
    expect(onFocus).toHaveBeenLastCalledWith(null);
  });
});
