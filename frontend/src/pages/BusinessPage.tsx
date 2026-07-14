import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { downloadEnterprisePlan } from "../features/enterpriseOperations/api";
import { useEnterpriseOperations } from "../features/enterpriseOperations/useEnterpriseOperations";
import type { OutcomeWrite, WorkspaceKind } from "../features/enterpriseOperations/types";
import { getDemoSession } from "../features/auth/session";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import { ErrorState } from "../shared/components/PageState";
import styles from "./BusinessPage.module.css";

const VIEW_LABELS: Record<WorkspaceKind, string> = {
  coach_operator: "Coach Dispatch / 巴士调度",
  freight_operator: "Freight Dispatch / 物流调度",
  enterprise_client: "Enterprise Client / 企业客户",
  port_authority: "Port Authority / 口岸官方",
};
const RISK_LABELS = { low: "Low / 低", medium: "Medium / 中", high: "High / 高" } as const;

function field(value: Record<string, unknown>, key: string): string {
  return String(value[key] ?? "");
}

export function BusinessPage() {
  const session = getDemoSession();
  const [view, setView] = useState<WorkspaceKind | undefined>(session?.role === "operator" ? "coach_operator" : undefined);
  const operations = useEnterpriseOperations(view);
  const workspace = operations.workspace.data;
  const preview = operations.preview.data;
  const adopted = operations.adopt.data;
  const result = adopted ?? preview;
  const [scenarioId, setScenarioId] = useState("");
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<OutcomeWrite>({
    actual_high_risk_count: 0,
    actual_average_arrival_delta_minutes: 8,
    actual_support_contacts: 12,
    note: "课堂演示复盘记录",
  });

  useEffect(() => {
    if (!workspace) return;
    setScenarioId(field(workspace.active_scenario, "id"));
    operations.clearDecision();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.active_scenario, workspace?.workspace_kind]);

  useEffect(() => {
    if (preview) setSelectedActions(preview.actions.map((item) => item.id));
  }, [preview]);

  if (operations.workspace.isPending) return <PageSkeleton cards={3} />;
  if (!workspace || operations.workspace.error) return <ErrorState title="无法载入企业运营方案" detail={operations.error} />;

  async function generate() {
    operations.adopt.reset();
    await operations.preview.mutateAsync(scenarioId);
  }

  async function adopt() {
    if (!preview) return;
    await operations.adopt.mutateAsync({ scenario_id: scenarioId, preview_id: preview.preview_id, selected_action_ids: selectedActions });
  }

  function publishNotice(event: FormEvent) {
    event.preventDefault();
    void operations.notice.mutateAsync({
      title: "五一早高峰口岸协调建议",
      message: "建议运营方在07:30–09:30分流罗湖高风险班次，并持续复核车辆周转。",
      affected_ports: workspace!.ports.slice(0, 3).map((port) => String(port.id)),
      valid_until: "2026-04-30T10:00:00+08:00",
      severity: "high",
    });
  }

  return (
    <main className="page">
      <div className="pageIntro">
        <span className="sectionKicker">AI at the core · B2B/B2G operations</span>
        <h1>Enterprise Predictive Dispatch / 企业预测与调度</h1>
        <p>Forecast the next three hours of border risk, compare service and fleet actions, then create an auditable local execution record.</p>
      </div>

      <section className={styles.editor}>
        <div className={styles.editorHeading}>
          <div>
            <h2>{field(workspace.active_scenario, "name")}</h2>
            <p>{field(workspace.active_scenario, "subtitle")} · Reconstructed at {new Date(field(workspace.active_scenario, "scenario_at")).toLocaleString("en-HK")}</p>
          </div>
          <div className={styles.batchPreferences}>
            {session?.role === "operator" && <label><span>Demo view / 演示视角</span><select value={view} onChange={(event) => setView(event.target.value as WorkspaceKind)}>{workspace.available_views.map((item) => <option key={item} value={item}>{VIEW_LABELS[item]}</option>)}</select></label>}
            <label><span>Operating scenario / 运营情景</span><select value={scenarioId} onChange={(event) => { setScenarioId(event.target.value); operations.clearDecision(); }}>{workspace.scenarios.map((item) => <option key={field(item, "id")} value={field(item, "id")}>{field(item, "name")}</option>)}</select></label>
          </div>
        </div>
        <div className={styles.readinessChecks}>
          {workspace.ports.map((port) => <span className={String(port.risk) === "high" ? styles.checkPending : styles.checkPassed} key={String(port.id)}>{String(port.name)} · {String(port.forecast_source) === "checked-in HGB model" ? "HGB" : "Fallback"} {String(port.wait_minutes)} min · 90% CI {Array.isArray(port.confidence_interval) ? port.confidence_interval.join("–") : "—"} · {RISK_LABELS[String(port.risk) as keyof typeof RISK_LABELS]}</span>)}
        </div>
        <p className={styles.recommendation}><strong>Embedded AI:</strong> {workspace.ai_decision_trace.model_version} · {workspace.ai_decision_trace.coverage_status} model coverage ({workspace.ai_decision_trace.model_supported_port_count}/{workspace.ai_decision_trace.total_port_count} ports) · {workspace.ai_decision_trace.prediction_engine} · {Math.round(workspace.ai_decision_trace.confidence_level * 100)}% prediction interval.</p>
        <p className={styles.recommendation}><strong>Verified problem evidence:</strong> {field(workspace.active_scenario, "problem_evidence")} <a href={field(workspace.active_scenario, "problem_source_url")} target="_blank" rel="noreferrer">Official source ↗</a></p>
        <p className={styles.recommendation}>{workspace.demo_notice}</p>
        <div className={styles.editorActions}>
          {(workspace.workspace_kind === "enterprise_client" || session?.role === "operator") && <Link className={styles.add} to="/business/employees">Employee Shuttle Planning</Link>}
          <button className="button buttonDark" onClick={() => void generate()} disabled={operations.preview.isPending}>{operations.preview.isPending ? "Generating…" : result ? "Regenerate AI Plan" : "Generate AI Dispatch Plan"}</button>
        </div>
      </section>

      {result && (
        <section className={styles.result}>
          <div className={styles.stats}>
            <div><strong>{result.baseline.high_risk_count}→{result.recommended.high_risk_count}</strong><span>High-risk tasks</span></div>
            <div><strong>{result.baseline.vehicle_conflicts}→{result.recommended.vehicle_conflicts}</strong><span>Vehicle conflicts</span></div>
            <div><strong>{result.baseline.cost_exposure_hkd.toLocaleString()}→{result.recommended.cost_exposure_hkd.toLocaleString()}</strong><span>Scenario exposure · HK$</span></div>
          </div>
          {workspace.workspace_kind !== "port_authority" && <div className={styles.table}>
            <div className={styles.tableHeader}><span>Service / Vehicle</span><span>Original port</span><span>AI recommendation</span><span>Departure change</span><span>Risk</span><span>Predicted impact</span></div>
            {result.jobs.map((job) => <div className={styles.tableRow} key={job.id}><strong>{job.label} · {job.asset_id}</strong><span>{job.baseline_port}</span><span>{job.changed ? `${job.baseline_port} → ${job.recommended_port}` : "Keep plan"}</span><span>{job.baseline_departure_time} → {job.recommended_departure_time}</span><span>{RISK_LABELS[job.baseline_risk]} → {RISK_LABELS[job.recommended_risk]}</span><span>{job.changed ? `${Math.abs(job.arrival_delta_minutes)} min earlier` : "No change"}</span></div>)}
          </div>}
          <p className={styles.recommendation}><strong>AI decision chain:</strong> HGB wait forecast → transparent stress calibration → service/fleet constraint optimization. The scenario reduces {result.baseline.high_risk_count - result.recommended.high_risk_count} high-risk classifications and improves predicted arrival by {result.recommended.average_arrival_delta_minutes} minutes on average; it does not guarantee zero real-world delays.</p>
        </section>
      )}

      {result && <section className={styles.shadowSummary}>
        <div className={styles.shadowHeading}><div><span className="sectionKicker">Recommended actions</span><h2>{adopted ? "Plan Adopted / 方案已采用" : "AI Dispatch Actions / AI 调度措施"}</h2></div><span>Local execution checklist · No live dispatch connection</span></div>
        <div className={styles.history}>
          {result.actions.map((action) => <article key={action.id}><label><input type="checkbox" disabled={Boolean(adopted) || workspace.workspace_kind === "port_authority"} checked={selectedActions.includes(action.id)} onChange={(event) => setSelectedActions((current) => event.target.checked ? [...current, action.id] : current.filter((id) => id !== action.id))} /> <strong>{action.title}</strong></label><div><span>{action.detail}</span><span>{action.impact}</span></div></article>)}
        </div>
        {!adopted && workspace.workspace_kind !== "port_authority" && <button className="button buttonPrimary" disabled={!selectedActions.length || operations.adopt.isPending} onClick={() => void adopt()}>{operations.adopt.isPending ? "Adopting…" : "Adopt Plan & Create Notification Drafts"}</button>}
        {workspace.workspace_kind === "port_authority" && <form onSubmit={publishNotice}><button className="button buttonPrimary" disabled={operations.notice.isPending}>{operations.notice.isSuccess ? "Demo Notice Published" : "Publish Demo Coordination Notice"}</button></form>}
        {adopted && <p className={styles.recommendation}>{adopted.notifications_created} local notification drafts created. <button onClick={() => void downloadEnterprisePlan(adopted.plan_id)}>Export Execution CSV</button></p>}
      </section>}

      {adopted && workspace.workspace_kind !== "port_authority" && <section className={styles.readinessSummary}>
        <div className={styles.shadowHeading}><div><span className="sectionKicker">Outcome review</span><h2>Demo Operations Review / 运营复盘</h2></div><span>Human-entered outcome · Never presented as observed automatically</span></div>
        <div className={styles.batchPreferences}>
          <label><span>实际高风险任务</span><input type="number" min="0" value={outcome.actual_high_risk_count} onChange={(event) => setOutcome({ ...outcome, actual_high_risk_count: Number(event.target.value) })} /></label>
          <label><span>平均到达改善</span><input type="number" value={outcome.actual_average_arrival_delta_minutes} onChange={(event) => setOutcome({ ...outcome, actual_average_arrival_delta_minutes: Number(event.target.value) })} /></label>
          <label><span>客服咨询量</span><input type="number" min="0" value={outcome.actual_support_contacts} onChange={(event) => setOutcome({ ...outcome, actual_support_contacts: Number(event.target.value) })} /></label>
          <button className="button" onClick={() => void operations.outcome.mutateAsync({ planId: adopted.plan_id, payload: outcome })}>{operations.outcome.isSuccess ? "复盘已记录" : "保存本地复盘"}</button>
        </div>
      </section>}

      <section className={styles.history}>
        <div><h2>Recently Adopted Plans / 最近方案</h2><span>{operations.plans.length}</span></div>
        {operations.plans.length === 0 && <p>An auditable record appears here after a dispatch plan is adopted.</p>}
        {operations.plans.map((plan) => <article key={plan.plan_id}><div><strong>{field(plan.scenario, "name")}</strong><span>{new Date(plan.adopted_at).toLocaleString("zh-HK")} · {plan.status} · {plan.notifications_created} 条草稿</span></div><button onClick={() => void downloadEnterprisePlan(plan.plan_id)}>导出</button></article>)}
      </section>
      {operations.error && <p className="formError" role="alert">{operations.error}</p>}
    </main>
  );
}
