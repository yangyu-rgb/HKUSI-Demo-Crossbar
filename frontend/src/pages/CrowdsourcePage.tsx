import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { FeedItem } from "../features/crowdsource/FeedItem";
import type { ReportInput } from "../features/crowdsource/types";
import { useCrowdsource } from "../features/crowdsource/useCrowdsource";
import type { CrowdLevel } from "../features/realtime/types";
import { useRealtime } from "../features/realtime/useRealtime";
import { ErrorState } from "../shared/components/PageState";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import styles from "./CrowdsourcePage.module.css";


const CROWD_LABELS: Record<CrowdLevel, string> = {
  low: "畅通",
  medium: "正常",
  high: "拥挤",
};


export function CrowdsourcePage() {
  const [searchParams] = useSearchParams();
  const realtime = useRealtime();
  const crowdsource = useCrowdsource();
  const [port, setPort] = useState("福田");
  const [wait, setWait] = useState<number | "">("");
  const [crowd, setCrowd] = useState<CrowdLevel>("low");
  const [comment, setComment] = useState("");
  const [direction, setDirection] = useState<NonNullable<ReportInput["direction"]>>(
    "hong_kong_to_shenzhen",
  );
  const [channel, setChannel] = useState<NonNullable<ReportInput["channel"]>>(
    "traveller",
  );
  const forecastRunId = searchParams.get("forecast_run_id");
  const forecastPortId = searchParams.get("forecast_port_id");
  const forecastDirection = searchParams.get("direction");

  useEffect(() => {
    if (!forecastPortId || !realtime.data) {
      return;
    }
    const matchedPort = realtime.data.ports.find((item) => item.id === forecastPortId);
    if (matchedPort) {
      setPort(matchedPort.name);
    }
  }, [forecastPortId, realtime.data]);

  useEffect(() => {
    if (
      forecastDirection === "hong_kong_to_shenzhen"
      || forecastDirection === "shenzhen_to_hong_kong"
    ) {
      setDirection(forecastDirection);
    }
  }, [forecastDirection]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (wait === "") {
      return;
    }
    const submitted = await crowdsource.submit({
      user_id: "demo-user",
      port,
      actual_wait_time: wait,
      crowd_level: crowd,
      comment,
      forecast_run_id: forecastRunId,
      forecast_port_id: forecastPortId,
      direction,
      channel,
    });
    if (submitted) {
      await realtime.refresh();
      setWait("");
      setComment("");
    }
  }

  if (realtime.loading || crowdsource.loading) {
    return <PageSkeleton cards={2} />;
  }
  if (!realtime.data) {
    return <ErrorState title="无法载入众包页面" detail={realtime.error || "口岸数据不可用"} />;
  }

  return (
    <main className="page">
      <div className="pageIntro">
        <span className="sectionKicker">Human-in-the-loop</span>
        <h1>现场反馈让预测持续校准</h1>
        <p>反馈按新鲜度、等待偏差和人流一致性评分；有效数据按质量加权参与预测，同一口岸10分钟内不可重复提交。</p>
      </div>
      <section className={styles.grid}>
        <form className={styles.form} onSubmit={handleSubmit}>
          {forecastRunId && forecastPortId && (
            <p className={styles.forecastLink}>
              本次反馈将关联到路线预测并用于课堂校准，但不会被收集为真实训练标签。
            </p>
          )}
          <div className={styles.formRow}>
            <label>
              <span>所在口岸</span>
              <select value={port} onChange={(event) => setPort(event.target.value)}>
                {realtime.data.ports.map((item) => (
                  <option key={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label htmlFor="crowdsource-wait">
              <span>实际等待</span>
              <div className={styles.unitInput}>
                <input
                  id="crowdsource-wait"
                  type="number"
                  min="0"
                  max="180"
                  required
                  value={wait}
                  placeholder="请输入实际等待"
                  onChange={(event) => setWait(
                    event.target.value === "" ? "" : Number(event.target.value),
                  )}
                />
                <b>分钟</b>
              </div>
            </label>
          </div>
          <div className={styles.formRow}>
            <label>
              <span>通关方向</span>
              <select value={direction} onChange={(event) => setDirection(
                event.target.value as NonNullable<ReportInput["direction"]>,
              )}>
                <option value="hong_kong_to_shenzhen">香港 → 深圳</option>
                <option value="shenzhen_to_hong_kong">深圳 → 香港</option>
              </select>
            </label>
            <label>
              <span>通关类型</span>
              <select value={channel} onChange={(event) => setChannel(
                event.target.value as NonNullable<ReportInput["channel"]>,
              )}>
                <option value="traveller">旅客</option>
                <option value="vehicle">车辆</option>
                <option value="cargo">货运</option>
              </select>
            </label>
          </div>
          <label>
            <span>现场人流</span>
            <div className={styles.segmented}>
              {(["low", "medium", "high"] as CrowdLevel[]).map((level) => (
                <button
                  type="button"
                  className={crowd === level ? styles.active : ""}
                  onClick={() => setCrowd(level)}
                  key={level}
                >
                  {CROWD_LABELS[level]}
                </button>
              ))}
            </div>
          </label>
          <div className={styles.dataGovernance}>
            <strong>课堂 Demo 数据</strong>
            <small>单人、双人和多人高共识分别使用15%、30%和45%上限，并继续按质量、新鲜度和预测距离衰减；项目不收集现场真实训练标签。</small>
          </div>
          <label>
            <span>补充说明</span>
            <input
              value={comment}
              placeholder="选填：描述现场排队情况"
              onChange={(event) => setComment(event.target.value)}
              maxLength={160}
            />
          </label>
          <button className="button buttonAccent" disabled={crowdsource.submitting}>
            {crowdsource.submitting ? "正在提交…" : "提交反馈"}
          </button>
          {crowdsource.message && <p className="formSuccess">{crowdsource.message}</p>}
          {crowdsource.calibrationPreview && (
            <div className={styles.calibrationPreview}>
              <strong>{Number(crowdsource.calibrationPreview.distinct_reporters)} 名独立反馈者 · 有效权重 {Math.round(Number(crowdsource.calibrationPreview.effective_weight) * 100)}%</strong>
              <small>{String(crowdsource.calibrationPreview.reason)} · 当前上限 {Math.round(Number(crowdsource.calibrationPreview.weight_cap) * 100)}%</small>
            </div>
          )}
          {crowdsource.error && <p className="formError">{crowdsource.error}</p>}
        </form>

        <div className={styles.feedPanel}>
          <div className={styles.feedHeader}>
            <h2>最新现场动态</h2>
            <span>{crowdsource.reports.length} 条展示中</span>
          </div>
          <div className={styles.feedList}>
            {crowdsource.reports.map((report) => <FeedItem report={report} key={report.id} />)}
          </div>
        </div>
      </section>
    </main>
  );
}
