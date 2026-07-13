import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PortSituationMap } from "./PortSituationMap";
import type { PortStatus } from "./types";


describe("PortSituationMap", () => {
  it("announces port state and supports keyboard selection", () => {
    const onSelect = vi.fn();
    const ports = [
      { id: "futian", name: "福田", name_en: "Futian", map_position: { x: 53, y: 38 }, current_wait: 14, change_next_hour: 3 },
      { id: "luohu", name: "罗湖", name_en: "Lo Wu", map_position: { x: 69, y: 31 }, current_wait: 22, change_next_hour: -2 },
      { id: "huanggang", name: "皇岗", name_en: "Huanggang", map_position: { x: 46, y: 48 }, current_wait: 40, change_next_hour: 0 },
    ] as unknown as PortStatus[];
    render(<PortSituationMap ports={ports} selectedPortId="futian" onSelect={onSelect} />);
    const port = screen.getByRole("button", { name: "福田口岸，当前等待14分钟" });
    fireEvent.keyDown(port, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("futian");
    fireEvent.click(screen.getByRole("button", { name: "罗湖口岸，当前等待22分钟" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "皇岗口岸，当前等待40分钟" }), { key: " " });
    expect(onSelect).toHaveBeenCalledWith("luohu");
    expect(onSelect).toHaveBeenCalledWith("huanggang");
    expect(screen.getByText("离线示意坐标 · 不代表真实地理比例或导航路线")).toBeInTheDocument();
  });
});
