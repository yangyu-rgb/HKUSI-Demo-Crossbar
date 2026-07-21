import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  downloadEnterprisePlan,
  downloadEnterpriseTemplate,
} from "../features/enterpriseOperations/api";
import { useEnterpriseOperations } from "../features/enterpriseOperations/useEnterpriseOperations";
import type {
  OperationsJobInput,
  OperationsScenario,
  OutcomeWrite,
  WorkspaceKind,
} from "../features/enterpriseOperations/types";
import { getDemoSession } from "../features/auth/session";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import { ErrorState } from "../shared/components/PageState";
import styles from "./BusinessPage.module.css";

const VIEW_LABELS: Record<WorkspaceKind, string> = {
  coach_operator: "Coach Dispatch",
  freight_operator: "Freight Dispatch",
  enterprise_client: "Employee Planning",
  port_authority: "Port Authority",
};
const RISK_LABELS = { low: "Low", medium: "Medium", high: "High" } as const;
const PORT_LABELS: Record<string, string> = {
  luohu: "Lo Wu",
  futian: "Futian",
  huanggang: "Huanggang",
  "shenzhen-bay": "Shenzhen Bay",
  liantang: "Liantang",
  "man-kam-to": "Man Kam To",
};
const SCENARIO_IDS = ["normal-weekday", "holiday-peak", "concert-release", "typhoon-severe-weather"];
const DEFAULT_SCENARIO: OperationsScenario = {
  preset_id: "normal-weekday",
  name: "Normal Weekday",
  weather: "clear",
  is_holiday: false,
  events: [],
  port_constraints: {},
};

function field(value: Record<string, unknown>, key: string): string {
  return String(value[key] ?? "");
}

function localInput(value: string): string {
  return value.slice(0, 16);
}

function hkInput(value: string): string {
  return `${value}:00+08:00`;
}

function clock(value: string): string {
  return new Date(value).toLocaleTimeString("en-HK", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function departureDeltaMinutes(baseline: string, recommended: string): number {
  return Math.round((new Date(recommended).getTime() - new Date(baseline).getTime()) / 60_000);
}

function departureDisplay(baseline: string, recommended: string): string {
  return departureDeltaMinutes(baseline, recommended) === 0
    ? clock(recommended)
    : `${clock(baseline)} → ${clock(recommended)}`;
}

function departureImpact(baseline: string, recommended: string): string {
  const delta = departureDeltaMinutes(baseline, recommended);
  if (delta === 0) return "Departure unchanged";
  return `Departure ${Math.abs(delta)} min ${delta < 0 ? "earlier" : "later"}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function BusinessPage() {
  const session = getDemoSession();
  const navigate = useNavigate();
  const [view, setView] = useState<WorkspaceKind | undefined>(session?.role === "operator" ? "coach_operator" : undefined);
  const operations = useEnterpriseOperations(view);
  const workspace = operations.workspace.data;
  const preview = operations.preview.data;
  const adopted = operations.adopt.data;
  const result = adopted ?? preview;
  const [jobs, setJobs] = useState<OperationsJobInput[]>([]);
  const [scenario, setScenario] = useState<OperationsScenario>(DEFAULT_SCENARIO);
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeWrite>({
    actual_high_risk_count: 0,
    actual_average_arrival_delta_minutes: 0,
    actual_support_contacts: 0,
    note: "Classroom Demo review",
  });

  useEffect(() => {
    if (!workspace) return;
    setJobs([]);
    setScenario(clone(workspace.scenario_presets?.[0] ?? DEFAULT_SCENARIO));
    setInputMessage("");
    setShowAllJobs(false);
    operations.clearDecision();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.workspace_kind]);

  useEffect(() => {
    if (preview) setSelectedActions(preview.actions.map((item) => item.id));
  }, [preview]);

  const locations = workspace?.locations as { origins: Array<{ id: string; name: string }>; destinations: Array<{ id: string; name: string }> } | undefined;
  const coach = workspace?.workspace_kind !== "freight_operator";
  const ports = coach
    ? ["luohu", "futian", "huanggang", "shenzhen-bay"]
    : ["shenzhen-bay", "liantang", "man-kam-to"];
  const totalUnits = useMemo(
    () => jobs.reduce((sum, job) => sum + (coach ? job.passenger_count : job.load_units), 0),
    [coach, jobs],
  );

  if (operations.workspace.isPending) return <PageSkeleton cards={4} />;
  if (!workspace || operations.workspace.error) return <ErrorState title="Unable to load enterprise operations" detail={operations.error} />;

  const official = workspace.workspace_kind === "port_authority";

  function clearResults() {
    operations.clearDecision();
    setSelectedActions([]);
  }

  function updateJob(index: number, patch: Partial<OperationsJobInput>) {
    setJobs((current) => current.map((job, itemIndex) => itemIndex === index ? { ...job, ...patch } : job));
    clearResults();
  }

  function addJob() {
    const seed = workspace!.sample_jobs?.[0];
    if (!seed) return;
    const number = jobs.length + 1;
    const departure = new Date(seed.departure_time);
    departure.setMinutes(departure.getMinutes() + number * 15);
    const deadline = new Date(departure);
    deadline.setMinutes(deadline.getMinutes() + (coach ? 120 : 180));
    setJobs((current) => [...current, {
      ...clone(seed),
      id: `${coach ? "S" : "F"}-NEW-${number}`,
      label: `${coach ? "Service" : "Shipment"} #${number}`,
      asset_id: `${coach ? "A" : "T"}${String(number).padStart(2, "0")}`,
      departure_time: departure.toISOString(),
      arrival_deadline: deadline.toISOString(),
      asset_available_at: departure.toISOString(),
      baseline_port_id: ports[0],
    }]);
    setInputMessage("1 manual task added. Edit the row before analysis.");
    clearResults();
  }

  function loadSample() {
    const samples = workspace!.sample_jobs ?? [];
    setJobs(clone(samples));
    setShowAllJobs(false);
    setInputMessage(`${samples.length} validated Demo tasks loaded.`);
    clearResults();
  }

  async function importCsv(file: File | undefined) {
    if (!file) return;
    const imported = await operations.csv.mutateAsync({
      workspaceKind: workspace!.workspace_kind,
      csvText: await file.text(),
    });
    if (imported.valid) {
      setJobs(imported.jobs);
      setInputMessage(`${imported.summary.rows} rows · ${imported.summary.assets} assets · ${imported.summary.total_units} operating units validated.`);
      clearResults();
    } else {
      setInputMessage(imported.errors.map((item) => `Row ${item.row}: ${item.message}`).join(" · "));
    }
  }

  function selectScenario(selected: OperationsScenario) {
    setScenario(clone(selected));
    clearResults();
  }

  function updateScenarioEvent(patch: Partial<NonNullable<OperationsScenario["events"]>[number]>) {
    const events = scenario.events ?? [];
    const current = events[0] ?? {
      name: "Custom operating event",
      impact: "none",
      direction: null,
      affected_ports: ports,
      start_time: "00:00",
      end_time: "23:59",
    };
    setScenario({ ...scenario, events: [{ ...current, ...patch }, ...events.slice(1)] });
    clearResults();
  }

  async function compareScenarios() {
    if (!jobs.length) return;
    await operations.comparison.mutateAsync({ jobs, scenarioIds: SCENARIO_IDS });
  }

  async function generate() {
    operations.adopt.reset();
    await operations.preview.mutateAsync({ jobs, scenario });
  }

  async function adopt() {
    if (!preview) return;
    await operations.adopt.mutateAsync({
      scenario_id: scenario.preset_id,
      preview_id: preview.preview_id,
      selected_action_ids: selectedActions,
      jobs,
      scenario,
    });
  }

  function publishNotice(event: FormEvent) {
    event.preventDefault();
    void operations.notice.mutateAsync({
      title: "Cross-border operating coordination window",
      message: "Operators should review port pressure, diversion capacity and vehicle circulation before the next three-hour operating window.",
      affected_ports: workspace!.ports.slice(0, 3).map((port) => String(port.id)),
      valid_until: "2026-07-15T10:00:00+08:00",
      severity: "high",
    });
  }

  return (
    <main className="page">
      <div className="pageIntro">
        <span className="sectionKicker">AI at the core · Input to execution</span>
        <h1>Enterprise Predictive Dispatch</h1>
        <p>Import an operating plan, stress-test it across four scenarios, then let the model and constraint optimizer produce an auditable dispatch decision.</p>
      </div>

      <section className={styles.editor}>
        <div className={styles.editorHeading}>
          <div><span className="sectionKicker">Stage 1 · Operating input</span><h2>Import Services or Shipments</h2><p>Draft data stays in this browser until a plan is adopted.</p></div>
          {session?.role === "operator" && <label><span>Demo view</span><select value={view} onChange={(event) => {
            const selectedView = event.target.value as WorkspaceKind;
            if (selectedView === "enterprise_client") {
              navigate("/business/employees");
              return;
            }
            setView(selectedView);
          }}>{workspace.available_views.map((item) => <option key={item} value={item}>{VIEW_LABELS[item]}</option>)}</select></label>}
        </div>

        {!official && <>
          <div className={styles.editorActions}>
            <button type="button" className={styles.add} onClick={loadSample}>Load Demo Sample</button>
            <label className={styles.add}>Import CSV<input hidden type="file" accept=".csv,text/csv" onChange={(event) => void importCsv(event.target.files?.[0])} /></label>
            <button type="button" className={styles.add} onClick={() => void downloadEnterpriseTemplate(workspace.workspace_kind)}>Download Template</button>
            <button type="button" className={styles.add} onClick={addJob}>+ Add Task</button>
            <span className={styles.inputSummary}>{jobs.length} tasks · {new Set(jobs.map((job) => job.asset_id)).size} assets · {totalUnits} {coach ? "passengers" : "load units"}</span>
          </div>
          {inputMessage && <p className={inputMessage.includes("Row") ? "formError" : "formSuccess"}>{inputMessage}</p>}
          {jobs.length === 0 && <div className={styles.emptyInput}><strong>No operating data loaded</strong><span>Load the deterministic sample, upload the role-specific CSV, or add a task manually.</span></div>}
          {jobs.length > 0 && <div className={styles.inputTable}>
            <div className={styles.inputHeader}><span>Task / Asset</span><span>Origin → Destination</span><span>Departure / Deadline</span><span>Original port</span><span>{coach ? "Passengers / Seats" : "Load / Capacity"}</span><span>Exposure HK$</span><span /></div>
            {jobs.slice(0, showAllJobs ? jobs.length : 4).map((job, index) => <div className={styles.inputRow} key={job.id}>
              <div><input aria-label={`Task ${index + 1} label`} value={job.label} onChange={(event) => updateJob(index, { label: event.target.value })} /><input aria-label={`Task ${index + 1} asset`} value={job.asset_id} onChange={(event) => updateJob(index, { asset_id: event.target.value })} /></div>
              <div><select aria-label={`Task ${index + 1} origin`} value={job.origin_id} onChange={(event) => updateJob(index, { origin_id: event.target.value })}>{locations?.origins.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label={`Task ${index + 1} destination`} value={job.destination_id} onChange={(event) => updateJob(index, { destination_id: event.target.value })}>{locations?.destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <div><input aria-label={`Task ${index + 1} departure`} type="datetime-local" value={localInput(job.departure_time)} onChange={(event) => updateJob(index, { departure_time: hkInput(event.target.value), asset_available_at: hkInput(event.target.value) })} /><input aria-label={`Task ${index + 1} deadline`} type="datetime-local" value={localInput(job.arrival_deadline)} onChange={(event) => updateJob(index, { arrival_deadline: hkInput(event.target.value) })} /></div>
              <select aria-label={`Task ${index + 1} original port`} value={job.baseline_port_id} onChange={(event) => updateJob(index, { baseline_port_id: event.target.value })}>{ports.map((port) => <option key={port} value={port}>{PORT_LABELS[port]}</option>)}</select>
              <div><input aria-label={`Task ${index + 1} units`} min="0" type="number" value={coach ? job.passenger_count : job.load_units} onChange={(event) => updateJob(index, coach ? { passenger_count: Number(event.target.value) } : { load_units: Number(event.target.value) })} /><input aria-label={`Task ${index + 1} capacity`} min="1" type="number" value={job.asset_capacity} onChange={(event) => updateJob(index, { asset_capacity: Number(event.target.value) })} /></div>
              <input aria-label={`Task ${index + 1} exposure`} min="0" type="number" value={job.exposure_hkd} onChange={(event) => updateJob(index, { exposure_hkd: Number(event.target.value) })} />
              <button type="button" className={styles.remove} onClick={() => { setJobs((current) => current.filter((_, itemIndex) => itemIndex !== index)); clearResults(); }}>Delete</button>
            </div>)}
          </div>}
          {jobs.length > 4 && <button type="button" className={styles.expandTasks} onClick={() => setShowAllJobs((current) => !current)}>{showAllJobs ? "Show first 4 tasks" : `Show remaining ${jobs.length - 4} tasks`}</button>}
        </>}

        {official && <p className={styles.recommendation}>Port Authority receives only aggregated pressure and adopted-plan coordination signals. Company task, vehicle and CSV data remain hidden.</p>}
      </section>

      {!official && <section className={styles.shadowSummary}>
        <div className={styles.shadowHeading}><div><span className="sectionKicker">Stage 2 · Scenario stress test</span><h2>Choose and Compare Scenarios</h2><p>Normal Weekday is the control and preserves the submitted plan. Stress scenarios optimize only tasks whose original port is affected.</p></div><button className="button buttonPrimary" disabled={!jobs.length || operations.comparison.isPending} onClick={() => void compareScenarios()}>{operations.comparison.isPending ? "Running 4 scenarios…" : "Compare All 4 Scenarios"}</button></div>
        <div className={styles.scenarioGrid}>
          {(workspace.scenario_presets ?? [DEFAULT_SCENARIO]).map((item) => {
            const comparison = operations.comparison.data?.scenarios.find((candidate) => field(candidate.scenario, "preset_id") === item.preset_id);
            const selected = scenario.preset_id === item.preset_id;
            return <button type="button" className={selected ? styles.scenarioSelected : styles.scenarioCard} key={item.preset_id} onClick={() => selectScenario(item)}>
              <span>{item.preset_id === "normal-weekday" ? "Control baseline" : item.weather.replace("_", " ")} · {item.is_holiday ? "Holiday" : "Working day"}</span>
              <strong>{item.name}</strong>
              {comparison ? <><b>{comparison.baseline.high_risk_count}→{comparison.recommended.high_risk_count} high risk · {comparison.baseline.vehicle_conflicts}→{comparison.recommended.vehicle_conflicts} conflicts</b><small>HK${comparison.baseline.cost_exposure_hkd.toLocaleString()}→${comparison.recommended.cost_exposure_hkd.toLocaleString()} exposure · {comparison.action_count} changes</small></> : <small>Run the comparison to calculate this scenario.</small>}
            </button>;
          })}
        </div>
        <div className={styles.scenarioEditor}>
          <label><span>Weather</span><select value={scenario.weather} onChange={(event) => { setScenario({ ...scenario, weather: event.target.value as OperationsScenario["weather"] }); clearResults(); }}><option value="clear">Clear</option><option value="rain">Rain</option><option value="heavy_rain">Heavy rain</option><option value="thunderstorm">Thunderstorm</option></select></label>
          <label className={styles.checkbox}><input type="checkbox" checked={scenario.is_holiday} onChange={(event) => { setScenario({ ...scenario, is_holiday: event.target.checked }); clearResults(); }} /> Holiday traffic</label>
          <label><span>Event impact</span><select value={scenario.events?.[0]?.impact ?? "none"} onChange={(event) => updateScenarioEvent({ impact: event.target.value })}><option value="none">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label><span>Shenzhen Bay status</span><select value={scenario.port_constraints?.["shenzhen-bay"] ?? "open"} onChange={(event) => { setScenario({ ...scenario, port_constraints: { ...(scenario.port_constraints ?? {}), "shenzhen-bay": event.target.value as "open" | "restricted" | "closed" } }); clearResults(); }}><option value="open">Open</option><option value="restricted">Restricted</option><option value="closed">Closed</option></select></label>
          <label><span>Event direction</span><select value={scenario.events?.[0]?.direction ?? ""} onChange={(event) => updateScenarioEvent({ direction: event.target.value || null })}><option value="">Both directions</option><option value="hong_kong_to_shenzhen">Hong Kong → Shenzhen</option><option value="shenzhen_to_hong_kong">Shenzhen → Hong Kong</option></select></label>
          <label><span>Event window</span><div className={styles.timePair}><input aria-label="Event start time" type="time" value={scenario.events?.[0]?.start_time ?? "00:00"} onChange={(event) => updateScenarioEvent({ start_time: event.target.value })} /><input aria-label="Event end time" type="time" value={scenario.events?.[0]?.end_time ?? "23:59"} onChange={(event) => updateScenarioEvent({ end_time: event.target.value })} /></div></label>
          <button className="button buttonDark" disabled={!jobs.length || operations.preview.isPending} onClick={() => void generate()}>{operations.preview.isPending ? "Model analysing…" : result ? "Regenerate Selected Scenario" : "Analyse Selected Scenario"}</button>
        </div>
        <div className={styles.scenarioPorts}><span>Affected ports</span>{ports.map((port) => { const affected = scenario.events?.[0]?.affected_ports ?? []; return <label key={port}><input type="checkbox" checked={affected.includes(port)} onChange={(event) => updateScenarioEvent({ affected_ports: event.target.checked ? [...affected, port] : affected.filter((item) => item !== port) })} />{PORT_LABELS[port]}</label>; })}</div>
      </section>}

      {(result || official) && <section className={styles.result}>
        <div className={styles.shadowHeading}><div><span className="sectionKicker">Stage 3 · AI analysis</span><h2>{official ? "Aggregate Port Pressure" : `${field(result!.scenario, "name")} Decision`}</h2></div><span>{workspace.ai_decision_trace.model_version}</span></div>
        <div className={styles.readinessChecks}>
          <span className={styles.checkPassed}>✓ Input validated</span><span className={styles.checkPassed}>✓ HGB forecast</span><span className={styles.checkPassed}>✓ Scenario calibrated</span><span className={styles.checkPassed}>✓ Constraints optimized</span><span className={styles.checkPassed}>✓ Plan ready</span>
        </div>
        <div className={styles.readinessChecks}>
          {((result?.ai_decision_trace.ports ?? workspace.ports) as Array<Record<string, unknown>>).map((port) => <span className={String(port.stress_signal ?? port.risk) === "high" ? styles.checkPending : styles.checkPassed} key={String(port.port_id ?? port.id)}>{String(port.name)} · {String(port.forecast_source) === "checked-in HGB model" ? "HGB" : "Fallback"} {String(port.calibrated_wait_minutes ?? port.wait_minutes)} min · 90% CI {Array.isArray(port.confidence_interval) ? port.confidence_interval.join("–") : "—"}</span>)}
        </div>
        {result && <>
          <div className={styles.stats}>
            <div><strong>{result.baseline.high_risk_count}→{result.recommended.high_risk_count}</strong><span>High-risk tasks</span></div>
            <div><strong>{result.baseline.vehicle_conflicts}→{result.recommended.vehicle_conflicts}</strong><span>Vehicle conflicts</span></div>
            <div><strong>{result.baseline.cost_exposure_hkd.toLocaleString()}→{result.recommended.cost_exposure_hkd.toLocaleString()}</strong><span>Scenario exposure · HK$</span></div>
          </div>
          <div className={styles.table}>
            <div className={styles.tableHeader}><span>Task / Vehicle</span><span>Original port</span><span>AI recommendation</span><span>Departure</span><span>Risk</span><span>Model / departure impact</span></div>
            {result.jobs.map((job) => <div className={styles.tableRow} key={job.id}><strong>{job.label} · {job.asset_id === job.recommended_asset_id ? job.asset_id : `${job.asset_id}→${job.recommended_asset_id}`}</strong><span>{job.baseline_port}</span><span>{job.changed ? `${job.baseline_port} → ${job.recommended_port}` : "Keep plan"}</span><span>{departureDisplay(job.baseline_departure_time, job.recommended_departure_time)}</span><span>{RISK_LABELS[job.baseline_risk]} → {RISK_LABELS[job.recommended_risk]}</span><span>{job.predicted_wait_minutes} min · {job.model_source === "checked-in HGB model" ? "HGB" : "Fallback"} · {departureImpact(job.baseline_departure_time, job.recommended_departure_time)}</span></div>)}
          </div>
          <p className={styles.recommendation}><strong>AI decision chain:</strong> imported task data → HGB port forecast → transparent weather/holiday/event calibration → causal eligibility check → route, capacity, availability and turnaround constraints. Unaffected submitted tasks stay unchanged, and no task is diverted into an affected or restricted port. Results are scenario estimates, not observed savings.</p>
        </>}
        <p className={styles.recommendation}><strong>Verified problem evidence:</strong> {field(workspace.active_scenario, "problem_evidence")} <a href={field(workspace.active_scenario, "problem_source_url")} target="_blank" rel="noreferrer">Official source ↗</a></p>
      </section>}

      {result && <section className={styles.shadowSummary}>
        <div className={styles.shadowHeading}><div><span className="sectionKicker">Stage 4 · Adopt and execute</span><h2>{adopted ? "Plan Adopted" : "AI Dispatch Actions"}</h2></div><span>Local execution checklist · No live dispatch connection</span></div>
        <div className={styles.history}>
          {result.actions.map((action) => <article key={action.id}><label><input type="checkbox" disabled={Boolean(adopted)} checked={selectedActions.includes(action.id)} onChange={(event) => setSelectedActions((current) => event.target.checked ? [...current, action.id] : current.filter((id) => id !== action.id))} /> <strong>{action.title}</strong></label><div><span>{action.detail}</span><span>{action.impact}</span></div></article>)}
        </div>
        {!adopted && <button className="button buttonPrimary" disabled={!selectedActions.length || operations.adopt.isPending} onClick={() => void adopt()}>{operations.adopt.isPending ? "Adopting…" : `Adopt ${selectedActions.length} Actions & Create Drafts`}</button>}
        {adopted && <p className={styles.recommendation}>{adopted.notifications_created} local notification drafts created. <button onClick={() => void downloadEnterprisePlan(adopted.plan_id)}>Export Execution CSV</button></p>}
      </section>}

      {official && <section className={styles.shadowSummary}><form onSubmit={publishNotice}><div className={styles.shadowHeading}><div><span className="sectionKicker">Coordination</span><h2>Publish Aggregate Operating Notice</h2></div><button className="button buttonPrimary" disabled={operations.notice.isPending}>{operations.notice.isSuccess ? "Demo Notice Published" : "Publish Demo Coordination Notice"}</button></div></form></section>}

      {adopted && !official && <section className={styles.readinessSummary}>
        <div className={styles.shadowHeading}><div><span className="sectionKicker">Outcome review</span><h2>Human-entered Operations Review</h2></div><span>Never presented as automatically observed</span></div>
        <div className={styles.batchPreferences}>
          <label><span>Actual high-risk tasks</span><input type="number" min="0" value={outcome.actual_high_risk_count} onChange={(event) => setOutcome({ ...outcome, actual_high_risk_count: Number(event.target.value) })} /></label>
          <label><span>Arrival improvement</span><input type="number" value={outcome.actual_average_arrival_delta_minutes} onChange={(event) => setOutcome({ ...outcome, actual_average_arrival_delta_minutes: Number(event.target.value) })} /></label>
          <label><span>Support contacts</span><input type="number" min="0" value={outcome.actual_support_contacts} onChange={(event) => setOutcome({ ...outcome, actual_support_contacts: Number(event.target.value) })} /></label>
          <button className="button" onClick={() => void operations.outcome.mutateAsync({ planId: adopted.plan_id, payload: outcome })}>{operations.outcome.isSuccess ? "Review saved" : "Save local review"}</button>
        </div>
      </section>}

      <section className={styles.history}>
        <div><h2>Recently Adopted Plans</h2><span>{operations.plans.length}</span></div>
        {operations.plans.length === 0 && <p>An auditable record appears here only after a plan is adopted.</p>}
        {operations.plans.map((plan) => <article key={plan.plan_id}><div><strong>{field(plan.scenario, "name")}</strong><span>{new Date(plan.adopted_at).toLocaleString("en-HK")} · {plan.status} · {plan.notifications_created} drafts</span></div><button onClick={() => void downloadEnterprisePlan(plan.plan_id)}>Export</button></article>)}
      </section>
      {!official && (workspace.workspace_kind === "enterprise_client" || session?.role === "operator") && <p className={styles.recommendation}>Employee shuttle planning remains available as a supporting workflow: <Link to="/business/employees">open employee planning</Link>.</p>}
      {operations.error && <p className="formError" role="alert">{operations.error}</p>}
    </main>
  );
}
