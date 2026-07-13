import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchOperationsSummary } from "../features/demo/api";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import { ErrorState } from "../shared/components/PageState";
import { userFacingError } from "../shared/api/client";
import styles from "./OperationsPage.module.css";


function entries(value: Record<string, number>): [string, number][] {
  return Object.entries(value).sort((left, right) => right[1] - left[1]);
}


export function OperationsPage() {
  const [windowHours, setWindowHours] = useState(24);
  const summary = useQuery({
    queryKey: ["operations-summary", windowHours],
    queryFn: () => fetchOperationsSummary(windowHours),
    refetchInterval: 60_000,
  });
  if (summary.isPending) return <PageSkeleton cards={4} />;
  if (!summary.data || summary.error) {
    return <ErrorState title="无法载入运营分析" detail={userFacingError(summary.error)} />;
  }
  const data = summary.data;
  const forecast = data.forecast as { total_runs: number; engine_counts: Record<string, number> };
  const crowdsource = data.crowdsource as { used_for_prediction: number; distinct_reporters: number; average_quality_score: number | null; quality_counts: Record<string, number>; linked_feedback_count: number };
  const errors = data.errors as { total: number; by_code: Record<string, number> };
  const audit = data.audit as { total: number; by_path: Record<string, number> };
  const adapters = data.adapters as { database_ready: boolean; providers: Array<{ provider: string; status: string; fallback: boolean }> };
  const engineCounts = forecast.engine_counts;
  const qualityCounts = crowdsource.quality_counts;
  const errorCounts = errors.by_code;
  const auditPaths = audit.by_path;
  const providerRows = adapters.providers;
  return (
    <main className="page">
      <div className={styles.intro}>
        <div><span className="sectionKicker">B2B operations intelligence</span><h1>Demo 运营分析中心</h1><p>汇总预测运行、众包可信度、错误与业务操作。所有指标只来自本地课堂数据。</p></div>
        <div className={styles.window} role="group" aria-label="分析时间窗口">
          {[24, 168].map((hours) => <button className={windowHours === hours ? styles.active : ""} onClick={() => setWindowHours(hours)} key={hours}>{hours === 24 ? "24小时" : "7天"}</button>)}
        </div>
      </div>
      <section className={styles.metrics} aria-label="运营核心指标">
        <article><span>预测运行</span><strong>{forecast.total_runs}</strong><small>正式预测记录</small></article>
        <article><span>有效众包</span><strong>{crowdsource.used_for_prediction}</strong><small>{crowdsource.distinct_reporters} 名独立反馈者</small></article>
        <article><span>平均质量</span><strong>{crowdsource.average_quality_score ?? "—"}</strong><small>课堂反馈质量分</small></article>
        <article className={errors.total > 0 ? styles.warningMetric : ""}><span>错误事件</span><strong>{errors.total}</strong><small>带请求 ID 可追踪</small></article>
      </section>
      <section className={styles.grid}>
        <article className={styles.panel}><header><h2>预测引擎分布</h2><span>{windowHours === 24 ? "最近24小时" : "最近7天"}</span></header><div className={styles.bars}>{entries(engineCounts).length ? entries(engineCounts).map(([label, count]) => <div key={label}><span>{label === "v2_2_transparent_hybrid" ? "AI v2.2" : "统计降级"}</span><i><b style={{ width: `${Math.max(8, count / Math.max(1, forecast.total_runs) * 100)}%` }} /></i><strong>{count}</strong></div>) : <p className={styles.empty}>先生成一次路线预测，即可看到引擎运行分布。</p>}</div></article>
        <article className={styles.panel}><header><h2>众包质量结构</h2><span>{crowdsource.linked_feedback_count} 条关联预测</span></header><div className={styles.quality}>{["high", "medium", "low"].map((level) => <div key={level}><strong>{qualityCounts[level] ?? 0}</strong><span>{level === "high" ? "高可信" : level === "medium" ? "中可信" : "低可信"}</span></div>)}</div></article>
        <article className={styles.panel}><header><h2>错误与恢复信号</h2><span>{errors.total ? "需要关注" : "运行正常"}</span></header>{entries(errorCounts).length ? <ul>{entries(errorCounts).map(([code, count]) => <li key={code}><span>{code}</span><strong>{count}</strong></li>)}</ul> : <p className={styles.empty}>当前窗口没有已记录错误。</p>}</article>
        <article className={styles.panel}><header><h2>业务操作分布</h2><span>{audit.total} 次写操作</span></header>{entries(auditPaths).length ? <ul>{entries(auditPaths).slice(0, 6).map(([path, count]) => <li key={path}><span>{path}</span><strong>{count}</strong></li>)}</ul> : <p className={styles.empty}>提交反馈、创建提醒或生成企业方案后会显示操作记录。</p>}</article>
      </section>
      <section className={styles.adapterPanel}><div><span className="sectionKicker">Adapter health</span><h2>课堂运行适配器</h2></div><div className={styles.adapters}><span className={adapters.database_ready ? styles.ok : styles.bad}>SQLite · {adapters.database_ready ? "就绪" : "异常"}</span>{providerRows.map((provider) => <span className={!provider.fallback && provider.status === "available" ? styles.ok : styles.bad} key={provider.provider}>{provider.provider} · {provider.fallback ? "降级" : provider.status}</span>)}</div></section>
    </main>
  );
}
