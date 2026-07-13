import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ReportInput } from "../features/crowdsource/types";
import { useCrowdsource } from "../features/crowdsource/useCrowdsource";
import type { CrowdLevel } from "../features/realtime/types";
import { useRealtime } from "../features/realtime/useRealtime";
import { getDemoPersonaId } from "../shared/api/client";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import { useMobileSession } from "./MobileSession";
import styles from "./MobilePages.module.css";


const crowdLabels: Record<CrowdLevel, string> = { low: "畅通", medium: "正常", high: "拥挤" };


export function MobileFeedbackPage() {
  const [searchParams] = useSearchParams();
  const realtime = useRealtime();
  const crowdsource = useCrowdsource();
  const session = useMobileSession();
  const forecastRunId = searchParams.get("forecast_run_id") ?? session.prediction?.forecast_run_id ?? null;
  const forecastPortId = searchParams.get("forecast_port_id") ?? session.prediction?.recommended_port_id ?? null;
  const forecastDirection = searchParams.get("direction") ?? session.prediction?.direction ?? "hong_kong_to_shenzhen";
  const [port, setPort] = useState("福田");
  const [wait, setWait] = useState<number | "">("");
  const [crowd, setCrowd] = useState<CrowdLevel>("low");
  const [direction, setDirection] = useState<NonNullable<ReportInput["direction"]>>(
    forecastDirection === "shenzhen_to_hong_kong" ? forecastDirection : "hong_kong_to_shenzhen",
  );
  const [channel, setChannel] = useState<NonNullable<ReportInput["channel"]>>("traveller");
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!forecastPortId || !realtime.data) return;
    const matched = realtime.data.ports.find((item) => item.id === forecastPortId);
    if (matched) setPort(matched.name);
  }, [forecastPortId, realtime.data]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (wait === "") return;
    const ok = await crowdsource.submit({ user_id: getDemoPersonaId(), port, actual_wait_time: wait, crowd_level: crowd, comment, forecast_run_id: forecastRunId, forecast_port_id: forecastPortId, direction, channel });
    if (ok) {
      session.markPredictionStale();
      await realtime.refresh();
      setSubmitted(true); setWait(""); setComment("");
    }
  }

  if (realtime.loading || crowdsource.loading) return <PageSkeleton cards={2} />;
  if (!realtime.data) return <main className={styles.page}><p className={styles.error}>{realtime.error || "口岸数据暂时不可用"}</p></main>;

  return (
    <main className={styles.page}>
      <div className={styles.intro}><span>Human in the loop</span><h1>提交现场反馈</h1><p>反馈最多以 30% 权重校准当前预测，不会作为真实训练标签。</p></div>
      <section className={styles.card}>
        {forecastRunId && <p className={styles.message}>已关联最近一次移动路线预测。</p>}
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.row}>
            <label>所在口岸<select aria-label="移动反馈口岸" value={port} onChange={(event) => setPort(event.target.value)}>{realtime.data.ports.map((item) => <option key={item.id}>{item.name}</option>)}</select></label>
            <label>实际等待<input aria-label="移动实际等待" type="number" min="0" max="180" required value={wait} placeholder="分钟" onChange={(event) => setWait(event.target.value === "" ? "" : Number(event.target.value))} /></label>
          </div>
          <div className={styles.row}>
            <label>通关方向<select aria-label="移动反馈方向" value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}><option value="hong_kong_to_shenzhen">香港 → 深圳</option><option value="shenzhen_to_hong_kong">深圳 → 香港</option></select></label>
            <label>通关类型<select aria-label="移动通关类型" value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)}><option value="traveller">旅客</option><option value="vehicle">车辆</option><option value="cargo">货运</option></select></label>
          </div>
          <div><small>现场人流</small><div className={styles.chips}>{(["low","medium","high"] as CrowdLevel[]).map((level) => <button type="button" aria-pressed={crowd === level} onClick={() => setCrowd(level)} key={level}>{crowdLabels[level]}</button>)}</div></div>
          <label>补充说明<textarea aria-label="移动反馈说明" maxLength={160} value={comment} placeholder="选填：描述现场情况" onChange={(event) => setComment(event.target.value)} /></label>
          <button className={styles.button} disabled={crowdsource.submitting}>{crowdsource.submitting ? "正在提交…" : "提交反馈"}</button>
          {crowdsource.message && <p className={styles.message}>{crowdsource.message}</p>}
          {crowdsource.error && <p className={styles.error}>{crowdsource.error}</p>}
          {submitted && session.prediction && <Link className={styles.linkButton} to="/mobile/planner">返回规划并查看最新校准</Link>}
        </form>
      </section>
      <section className={styles.card}><h2>最新现场动态</h2><div className={styles.list}>{crowdsource.reports.slice(0,4).map((report) => <article key={report.id}><header><strong>{report.port} · {report.actual_wait_time} 分钟</strong><b>{report.quality_score}分</b></header><p>{report.time_label} · {crowdLabels[report.crowd_level]} · {report.used_for_prediction ? "参与校准" : "仅记录"}</p></article>)}</div></section>
    </main>
  );
}
