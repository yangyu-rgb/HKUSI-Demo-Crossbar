import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ScenarioDay, ScenarioWrite } from "../features/scenario/api";
import { useScenarios } from "../features/scenario/useScenarios";
import { useDemoContext } from "../features/demo/useDemo";
import { fetchLocations } from "../features/prediction/api";
import type { PredictionQueryInput, Priority } from "../features/prediction/types";
import { getDemoPersonaId, userFacingError } from "../shared/api/client";
import { ErrorState } from "../shared/components/PageState";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import { queryKeys } from "../shared/queryKeys";
import styles from "./ScenarioPage.module.css";


const weatherLabels: Record<string, string> = { clear: "晴朗", rain: "降雨", heavy_rain: "暴雨", thunderstorm: "雷暴" };
const ports = ["罗湖", "福田", "皇岗", "深圳湾"];


function editable(day: ScenarioDay): ScenarioWrite {
  return { weather: day.weather, is_holiday: day.is_holiday, events: day.events.map((event) => ({ ...event })) };
}


export function ScenarioPage() {
  const { scenarios, save, restore, reset, compare } = useScenarios();
  const context = useDemoContext();
  const locations = useQuery({ queryKey: queryKeys.locations, queryFn: fetchLocations, staleTime: Infinity });
  const [selectedDate, setSelectedDate] = useState("");
  const [draft, setDraft] = useState<ScenarioWrite | null>(null);
  const [preset, setPreset] = useState("commuter_peak");
  const [comparisonQuery, setComparisonQuery] = useState<PredictionQueryInput>({
    direction: "hong_kong_to_shenzhen",
    origin_id: "hku",
    destination_id: "nanshan-tech",
    target_time: "",
    priority: "balanced",
    max_budget: 100,
  });
  const selected = useMemo(() => scenarios.data?.scenarios.find((item) => item.date === selectedDate), [scenarios.data, selectedDate]);

  useEffect(() => {
    const first = scenarios.data?.scenarios[0];
    if (!first || selectedDate) return;
    setSelectedDate(first.date);
    setDraft(editable(first));
  }, [scenarios.data, selectedDate]);
  useEffect(() => { if (selected) setDraft(editable(selected)); }, [selected]);
  useEffect(() => { compare.reset(); }, [draft]);
  useEffect(() => {
    if (!selectedDate || !scenarios.data || !context.data) return;
    setComparisonQuery((current) => ({
      ...current,
      target_time: selectedDate === scenarios.data!.start
        ? context.data!.suggested_target_time.slice(0, 16)
        : `${selectedDate}T09:30`,
    }));
  }, [selectedDate, scenarios.data, context.data]);

  if (scenarios.isPending || locations.isPending || context.isPending) return <PageSkeleton cards={3} />;
  if (!scenarios.data || !draft || !selected || !locations.data || !context.data) return <ErrorState title="无法载入场景实验室" detail={userFacingError(scenarios.error ?? locations.error ?? context.error)} />;
  const operator = getDemoPersonaId() === "demo-user";
  const busy = save.isPending || restore.isPending || reset.isPending;
  const mutationError = save.error ?? restore.error ?? reset.error;
  const selectedDirection = locations.data.directions.find((item) => item.id === comparisonQuery.direction) ?? locations.data.directions[0];
  const comparisonOrigins = locations.data.origins.filter((item) => selectedDirection.origin_ids.includes(item.id));
  const comparisonDestinations = locations.data.destinations.filter((item) => selectedDirection.destination_ids.includes(item.id));

  function addPreset() {
    const item = scenarios.data!.event_presets.find((candidate) => candidate.id === preset)!;
    setDraft({ ...draft!, events: [...draft!.events, { name: String(item.name), preset, direction: null, affected_ports: [...ports], start_time: String(item.start_time), end_time: String(item.end_time), impact: item.impact as "low" | "medium" | "high" }] });
  }

  function applyClassroomPreset() {
    setDraft({
      weather: "heavy_rain",
      is_holiday: true,
      events: [{
        name: "深圳湾大型活动",
        preset: "classroom_demo",
        direction: "hong_kong_to_shenzhen",
        affected_ports: ["深圳湾"],
        start_time: "00:00",
        end_time: "23:59",
        impact: "high",
      }],
    });
    setComparisonQuery((current) => ({
      ...current,
      direction: "hong_kong_to_shenzhen",
      origin_id: "hku",
      destination_id: "nanshan-tech",
      priority: "balanced",
      max_budget: 100,
    }));
  }

  function runComparison() {
    compare.mutate({
      origin_id: comparisonQuery.origin_id,
      destination_id: comparisonQuery.destination_id,
      target_time: comparisonQuery.target_time,
      preferences: {
        priority: comparisonQuery.priority,
        max_budget: comparisonQuery.max_budget,
      },
      scenario: draft!,
    });
  }

  return (
    <main className="page">
      <section className={styles.hero}>
        <div><span className="sectionKicker">AI scenario lab</span><h1>未来场景实验室</h1><p>调节未来14天的天气、节假日和口岸事件，再让 AI V2 生成不同路线方案。</p></div>
        <button className="button" disabled={!operator || busy} onClick={() => reset.mutate()}>重置全部场景</button>
      </section>
      {!operator && <p className={styles.notice}>请切换为“Demo 操作员”后修改场景；其他身份仍可查看。</p>}
      <section className={styles.calendar}>
        {scenarios.data.scenarios.map((day) => (
          <button key={day.date} className={day.date === selectedDate ? styles.selectedDay : styles.day} onClick={() => setSelectedDate(day.date)}>
            <strong>{day.date.slice(5)}</strong><span>{weatherLabels[day.weather]}</span><small>{day.events.length ? `${day.events.length} 个事件` : "默认场景"}{day.is_override ? " · 已修改" : ""}</small>
          </button>
        ))}
      </section>
      <section className={styles.editor}>
        <div className={styles.editorHeading}><div><span className="sectionKicker">Selected day</span><h2>{selected.date} 场景</h2></div><Link className="button buttonPrimary" to={selected.date === scenarios.data.start ? "/planner" : `/planner?target_time=${selected.date}T09:00`}>使用此场景规划</Link></div>
        <div className={styles.baseFields}>
          <label><span>天气</span><select aria-label="场景天气" disabled={!operator} value={draft.weather} onChange={(event) => setDraft({ ...draft, weather: event.target.value as ScenarioWrite["weather"] })}>{scenarios.data.weather_options.map((weather) => <option key={weather} value={weather}>{weatherLabels[weather]}</option>)}</select></label>
          <label className={styles.checkbox}><input disabled={!operator} type="checkbox" checked={draft.is_holiday} onChange={(event) => setDraft({ ...draft, is_holiday: event.target.checked })} />节假日客流</label>
          <label><span>事件预设</span><select aria-label="事件预设" disabled={!operator} value={preset} onChange={(event) => setPreset(event.target.value)}>{scenarios.data.event_presets.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></label>
          <button className="button" disabled={!operator || draft.events.length >= 8} onClick={addPreset}>添加事件</button>
        </div>
        <div className={styles.events}>
          {draft.events.length === 0 && <p className={styles.empty}>当天没有自定义事件。</p>}
          {draft.events.map((item, index) => (
            <article className={styles.eventCard} key={`${item.name}-${index}`}>
              <input aria-label="事件名称" disabled={!operator} value={item.name} onChange={(event) => setDraft({ ...draft, events: draft.events.map((current, i) => i === index ? { ...current, name: event.target.value } : current) })} />
              <select aria-label="事件方向" disabled={!operator} value={item.direction ?? ""} onChange={(event) => setDraft({ ...draft, events: draft.events.map((current, i) => i === index ? { ...current, direction: (event.target.value || null) as typeof current.direction } : current) })}><option value="">双向</option><option value="hong_kong_to_shenzhen">香港→深圳</option><option value="shenzhen_to_hong_kong">深圳→香港</option></select>
              <input aria-label="开始时间" disabled={!operator} type="time" value={item.start_time} onChange={(event) => setDraft({ ...draft, events: draft.events.map((current, i) => i === index ? { ...current, start_time: event.target.value } : current) })} />
              <input aria-label="结束时间" disabled={!operator} type="time" value={item.end_time} onChange={(event) => setDraft({ ...draft, events: draft.events.map((current, i) => i === index ? { ...current, end_time: event.target.value } : current) })} />
              <select aria-label="影响强度" disabled={!operator} value={item.impact} onChange={(event) => setDraft({ ...draft, events: draft.events.map((current, i) => i === index ? { ...current, impact: event.target.value as typeof current.impact } : current) })}><option value="low">低影响</option><option value="medium">中影响</option><option value="high">高影响</option></select>
              <div className={styles.portChecks}>{ports.map((port) => <label key={port}><input disabled={!operator} type="checkbox" checked={item.affected_ports.includes(port)} onChange={(event) => setDraft({ ...draft, events: draft.events.map((current, i) => i === index ? { ...current, affected_ports: event.target.checked ? [...current.affected_ports, port] : current.affected_ports.filter((value) => value !== port) } : current) })} />{port}</label>)}</div>
              <button className="button" disabled={!operator} onClick={() => setDraft({ ...draft, events: draft.events.filter((_, i) => i !== index) })}>删除</button>
            </article>
          ))}
        </div>
        {mutationError && <p className="formError">{userFacingError(mutationError)}</p>}
        <div className={styles.actions}><button className="button buttonPrimary" disabled={!operator || busy} onClick={() => save.mutate({ date: selected.date, payload: draft })}>保存场景</button><button className="button" disabled={!operator || busy} onClick={() => restore.mutate(selected.date)}>恢复当天默认</button></div>
      </section>
      <section className={styles.comparison}>
        <div className={styles.editorHeading}>
          <div><span className="sectionKicker">AI A/B comparison</span><h2>默认场景 vs 当前草稿</h2><p>无需保存即可比较，预览不会写入预测历史或审计。</p></div>
          <button className="button" disabled={!operator} onClick={applyClassroomPreset}>一键课堂演示</button>
        </div>
        <div className={styles.compareFields}>
          <label><span>方向</span><select aria-label="对比方向" value={comparisonQuery.direction} onChange={(event) => {
            const direction = locations.data!.directions.find((item) => item.id === event.target.value) ?? locations.data!.directions[0];
            setComparisonQuery({ ...comparisonQuery, direction: direction.id, origin_id: direction.origin_ids[0], destination_id: direction.destination_ids[0] });
          }}>{locations.data.directions.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
          <label><span>出发地</span><select aria-label="对比出发地" value={comparisonQuery.origin_id} onChange={(event) => setComparisonQuery({ ...comparisonQuery, origin_id: event.target.value })}>{comparisonOrigins.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label><span>目的地</span><select aria-label="对比目的地" value={comparisonQuery.destination_id} onChange={(event) => setComparisonQuery({ ...comparisonQuery, destination_id: event.target.value })}>{comparisonDestinations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label><span>到达时间</span><input aria-label="对比到达时间" type="datetime-local" min={context.data.min_target_time.slice(0, 16)} max={context.data.max_target_time.slice(0, 16)} value={comparisonQuery.target_time} onChange={(event) => setComparisonQuery({ ...comparisonQuery, target_time: event.target.value })} /></label>
          <label><span>偏好</span><select aria-label="对比偏好" value={comparisonQuery.priority} onChange={(event) => setComparisonQuery({ ...comparisonQuery, priority: event.target.value as Priority })}><option value="balanced">稳妥均衡</option><option value="fastest">时间最快</option><option value="cheapest">费用最低</option></select></label>
          <label><span>预算</span><input aria-label="对比预算" type="number" min="0" value={comparisonQuery.max_budget ?? ""} onChange={(event) => setComparisonQuery({ ...comparisonQuery, max_budget: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          <button className="button buttonPrimary" disabled={!operator || compare.isPending || !comparisonQuery.target_time} onClick={runComparison}>{compare.isPending ? "AI 对比中…" : "对比 AI 方案"}</button>
        </div>
        {compare.error && <p className="formError">{userFacingError(compare.error)}</p>}
        {compare.data && (
          <div className={styles.compareResults}>
            <div className={styles.recommendationChange}>
              <div><span>默认场景</span><strong>{compare.data.baseline.recommended}口岸</strong></div>
              <b>{compare.data.recommended_changed ? "推荐已切换 →" : "推荐未切换 →"}</b>
              <div><span>当前草稿</span><strong>{compare.data.candidate.recommended}口岸</strong></div>
            </div>
            <p className={styles.compareReason}>{compare.data.candidate.reason}</p>
            <div className={styles.portComparison}>
              {compare.data.ports.map((port) => (
                <article key={port.port_id}>
                  <h3>{port.port_name}</h3>
                  <div><span>默认</span><strong>{port.baseline_wait_minutes} 分钟</strong></div>
                  <div><span>草稿</span><strong>{port.candidate_wait_minutes} 分钟</strong></div>
                  <em className={port.wait_delta_minutes > 0 ? styles.increase : styles.decrease}>{port.wait_delta_minutes > 0 ? "+" : ""}{port.wait_delta_minutes} 分钟 · 风险 {port.late_risk_delta_percent > 0 ? "+" : ""}{port.late_risk_delta_percent}%</em>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
