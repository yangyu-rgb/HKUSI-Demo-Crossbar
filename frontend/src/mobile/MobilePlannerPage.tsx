import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useDemoContext } from "../features/demo/useDemo";
import { fetchLocations, fetchPrediction } from "../features/prediction/api";
import { DEFAULT_QUERY } from "../features/prediction/usePrediction";
import type { PredictionQueryInput, Priority } from "../features/prediction/types";
import { userFacingError } from "../shared/api/client";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import { formatClock } from "../shared/formatters";
import { queryKeys } from "../shared/queryKeys";
import { useMobileSession } from "./MobileSession";
import styles from "./MobilePages.module.css";


export function MobilePlannerPage() {
  const session = useMobileSession();
  const locations = useQuery({ queryKey: queryKeys.locations, queryFn: fetchLocations, staleTime: Infinity });
  const context = useDemoContext();
  const [query, setQuery] = useState<PredictionQueryInput>(session.query ?? DEFAULT_QUERY);
  const prediction = useMutation({
    mutationFn: fetchPrediction,
    onSuccess: (result, submitted) => session.savePrediction(submitted, result),
  });

  useEffect(() => {
    if (!context.data || query.target_time) return;
    setQuery((current) => ({ ...current, target_time: context.data!.suggested_target_time.slice(0, 16) }));
  }, [context.data, query.target_time]);

  const selectedDirection = useMemo(() => locations.data?.directions.find(
    (item) => item.id === query.direction,
  ) ?? locations.data?.directions[0], [locations.data, query.direction]);
  const origins = locations.data?.origins.filter((item) => selectedDirection?.origin_ids.includes(item.id)) ?? [];
  const destinations = locations.data?.destinations.filter((item) => selectedDirection?.destination_ids.includes(item.id)) ?? [];
  const result = prediction.data ?? session.prediction;
  const recommended = result?.ports.find((item) => item.port_id === result.recommended_port_id);

  function submit(event: FormEvent) {
    event.preventDefault();
    prediction.mutate(query);
  }

  if (locations.isPending || context.isPending) return <PageSkeleton cards={2} />;
  if (!locations.data || !context.data) {
    return <main className={styles.page}><p className={styles.error}>{userFacingError(locations.error ?? context.error)}</p></main>;
  }

  return (
    <main className={styles.page}>
      <div className={styles.intro}><span>AI route planner</span><h1>规划跨境行程</h1><p>输入到达要求，直接在手机端比较四个口岸并取得路线结果。</p></div>
      <section className={styles.card}>
        <form className={styles.form} onSubmit={submit}>
          <label>通勤方向<select aria-label="移动通勤方向" value={query.direction} onChange={(event) => {
            const direction = locations.data!.directions.find((item) => item.id === event.target.value) ?? locations.data!.directions[0];
            setQuery({ ...query, direction: direction.id, origin_id: direction.origin_ids[0], destination_id: direction.destination_ids[0] });
          }}>{locations.data.directions.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
          <div className={styles.row}>
            <label>出发地<select aria-label="移动出发地" value={query.origin_id} onChange={(event) => setQuery({ ...query, origin_id: event.target.value })}>{origins.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label>目的地<select aria-label="移动目的地" value={query.destination_id} onChange={(event) => setQuery({ ...query, destination_id: event.target.value })}>{destinations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          </div>
          <label>最迟到达<input aria-label="移动最迟到达" type="datetime-local" required min={context.data.min_target_time.slice(0,16)} max={context.data.max_target_time.slice(0,16)} value={query.target_time} onChange={(event) => setQuery({ ...query, target_time: event.target.value })} /></label>
          <div className={styles.row}>
            <label>路线偏好<select aria-label="移动路线偏好" value={query.priority} onChange={(event) => setQuery({ ...query, priority: event.target.value as Priority })}><option value="balanced">稳妥均衡</option><option value="fastest">时间最快</option><option value="cheapest">费用最低</option></select></label>
            <label>预算上限<input aria-label="移动预算上限" type="number" min="0" placeholder="不限" value={query.max_budget ?? ""} onChange={(event) => setQuery({ ...query, max_budget: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          </div>
          <button className={styles.button} disabled={prediction.isPending}>{prediction.isPending ? "AI 正在计算…" : session.predictionStale ? "根据新反馈重新计算" : "生成 AI 建议"}</button>
          {prediction.error && <p className={styles.error}>{userFacingError(prediction.error)}</p>}
        </form>
      </section>

      {result && recommended && (
        <section aria-live="polite">
          {session.predictionStale && <p className={styles.message}>现场反馈已经更新，请重新计算以查看最新校准结果。</p>}
          <div className={styles.resultHero}>
            <small>本次推荐 · {result.query.origin_name} → {result.query.destination_name}</small>
            <h2>{result.recommended}口岸</h2><p>{result.reason}</p>
            <div className={styles.metrics}>
              <div><strong>{recommended.predicted_wait_time}分</strong><span>预计等待</span></div>
              <div><strong>{recommended.total_time}分</strong><span>全程时间</span></div>
              <div><strong>{recommended.late_risk_percent}%</strong><span>迟到风险</span></div>
            </div>
          </div>
          <div className={styles.card}>
            <h2>出发建议</h2>
            <div className={styles.list}><article><header><strong>最晚 {formatClock(recommended.latest_departure)} 出发</strong><b>HK${recommended.total_cost}</b></header><p>90% 区间 {recommended.confidence_interval[0]}–{recommended.confidence_interval[1]} 分钟 · 安全缓冲 {recommended.buffer_minutes} 分钟</p></article></div>
            {result.forecast_run_id && <Link className={styles.linkButton} to={`/mobile/feedback?forecast_run_id=${encodeURIComponent(result.forecast_run_id)}&forecast_port_id=${encodeURIComponent(recommended.port_id)}&direction=${encodeURIComponent(result.direction)}`}>通关后反馈实际等待</Link>}
          </div>
          <div className={styles.list}>
            {result.ports.map((route) => <details key={route.port_id} open={route.port_id === result.recommended_port_id}><summary>{route.name} · {route.predicted_wait_time} 分钟 · HK${route.total_cost}</summary><p>全程 {route.total_time} 分钟，迟到风险 {route.late_risk_percent}%，90% 区间 {route.confidence_interval[0]}–{route.confidence_interval[1]} 分钟。</p></details>)}
          </div>
        </section>
      )}
    </main>
  );
}
