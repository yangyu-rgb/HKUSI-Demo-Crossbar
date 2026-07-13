import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useDemoContext } from "../features/demo/useDemo";
import { fetchLocations } from "../features/prediction/api";
import type { Priority } from "../features/prediction/types";
import type { ScenarioWrite } from "../features/scenario/api";
import { useScenarios } from "../features/scenario/useScenarios";
import { userFacingError } from "../shared/api/client";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import { queryKeys } from "../shared/queryKeys";
import styles from "./MobilePages.module.css";


type PresetId = "heavy_rain" | "holiday" | "event" | "classroom";
const presetLabels: Record<PresetId, string> = { heavy_rain: "暴雨通勤", holiday: "节假日高峰", event: "深圳湾活动", classroom: "综合压力" };


function makeScenario(id: PresetId): ScenarioWrite {
  const hasEvent = id === "event" || id === "classroom";
  return {
    weather: id === "heavy_rain" || id === "classroom" ? "heavy_rain" : "clear",
    is_holiday: id === "holiday" || id === "classroom",
    events: hasEvent ? [{ name: "深圳湾大型活动", preset: "classroom_demo", direction: "hong_kong_to_shenzhen", affected_ports: ["深圳湾"], start_time: "00:00", end_time: "23:59", impact: "high" }] : [],
  };
}


export function MobileScenarioPage() {
  const { scenarios, compare } = useScenarios();
  const locations = useQuery({ queryKey: queryKeys.locations, queryFn: fetchLocations, staleTime: Infinity });
  const context = useDemoContext();
  const [selectedDate, setSelectedDate] = useState("");
  const [preset, setPreset] = useState<PresetId>("classroom");
  const [direction, setDirection] = useState<"hong_kong_to_shenzhen" | "shenzhen_to_hong_kong">("hong_kong_to_shenzhen");
  const [originId, setOriginId] = useState("hku");
  const [destinationId, setDestinationId] = useState("nanshan-tech");
  const [priority, setPriority] = useState<Priority>("balanced");

  useEffect(() => { if (!selectedDate && scenarios.data?.start) setSelectedDate(scenarios.data.start); }, [scenarios.data, selectedDate]);
  const selectedDirection = useMemo(() => locations.data?.directions.find((item) => item.id === direction), [locations.data, direction]);
  const origins = locations.data?.origins.filter((item) => selectedDirection?.origin_ids.includes(item.id)) ?? [];
  const destinations = locations.data?.destinations.filter((item) => selectedDirection?.destination_ids.includes(item.id)) ?? [];

  if (scenarios.isPending || locations.isPending || context.isPending) return <PageSkeleton cards={2} />;
  if (!scenarios.data || !locations.data || !context.data) return <main className={styles.page}><p className={styles.error}>{userFacingError(scenarios.error ?? locations.error ?? context.error)}</p></main>;

  function runComparison() {
    const targetTime = selectedDate === scenarios.data!.start
      ? context.data!.suggested_target_time
      : `${selectedDate}T09:30:00+08:00`;
    compare.mutate({ origin_id: originId, destination_id: destinationId, target_time: targetTime, preferences: { priority, max_budget: 100 }, scenario: makeScenario(preset) });
  }

  return (
    <main className={styles.page}>
      <div className={styles.intro}><span>Scenario preview</span><h1>未来场景推演</h1><p>选择一个课堂预设，无需保存即可比较正常情况与压力场景。</p></div>
      <section className={styles.card}>
        <div className={styles.form}>
          <label>推演日期<select aria-label="移动场景日期" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>{scenarios.data.scenarios.map((item) => <option value={item.date} key={item.date}>{item.date}</option>)}</select></label>
          <div><small>压力预设</small><div className={styles.chips}>{(Object.keys(presetLabels) as PresetId[]).map((id) => <button type="button" aria-pressed={preset === id} key={id} onClick={() => setPreset(id)}>{presetLabels[id]}</button>)}</div></div>
          <label>通勤方向<select aria-label="移动场景方向" value={direction} onChange={(event) => {
            const next = event.target.value as typeof direction;
            const item = locations.data!.directions.find((candidate) => candidate.id === next)!;
            setDirection(next); setOriginId(item.origin_ids[0]); setDestinationId(item.destination_ids[0]);
          }}>{locations.data.directions.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
          <div className={styles.row}>
            <label>出发地<select aria-label="移动场景出发地" value={originId} onChange={(event) => setOriginId(event.target.value)}>{origins.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label>目的地<select aria-label="移动场景目的地" value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>{destinations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          </div>
          <label>路线偏好<select aria-label="移动场景偏好" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option value="balanced">稳妥均衡</option><option value="fastest">时间最快</option><option value="cheapest">费用最低</option></select></label>
          <button className={styles.button} disabled={compare.isPending} onClick={runComparison}>{compare.isPending ? "AI 正在推演…" : "对比 AI 方案"}</button>
          {compare.error && <p className={styles.error}>{userFacingError(compare.error)}</p>}
        </div>
      </section>
      {compare.data && <section aria-live="polite">
        <div className={styles.resultHero}><small>默认场景 → {presetLabels[preset]}</small><h2>{compare.data.candidate.recommended}口岸</h2><p>{compare.data.recommended_changed ? `推荐已从${compare.data.baseline.recommended}切换` : "推荐口岸保持不变，但等待和风险已经重新计算"}</p></div>
        <div className={styles.list}>{compare.data.ports.map((port) => <article key={port.port_id}><header><strong>{port.port_name}</strong><b>{port.wait_delta_minutes > 0 ? "+" : ""}{port.wait_delta_minutes} 分</b></header><p>默认 {port.baseline_wait_minutes} 分钟 → 场景 {port.candidate_wait_minutes} 分钟 · 迟到风险变化 {port.late_risk_delta_percent > 0 ? "+" : ""}{port.late_risk_delta_percent}%</p></article>)}</div>
        <p className={styles.message}>本次推演不会保存场景，也不会写入预测或审计历史。</p>
      </section>}
    </main>
  );
}
