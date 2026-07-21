import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBatchPlans } from "../features/business/useBatchPlans";
import { downloadBatchPlan, validateBatchCsv } from "../features/business/api";
import type { BatchEmployee, BatchRequest } from "../features/business/types";
import {
  useDemoContext,
  useModelShadowSummary,
} from "../features/demo/useDemo";
import { fetchLocations } from "../features/prediction/api";
import type { Priority } from "../features/prediction/types";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import { queryKeys } from "../shared/queryKeys";
import styles from "./BusinessPage.module.css";


const COMPANY = "Greater Bay Cross-border Services Ltd.";
const PRIORITY_LABELS: Record<Priority, string> = {
  balanced: "Balanced",
  fastest: "Fastest",
  cheapest: "Lowest cost",
};
const INITIAL_EMPLOYEES: BatchEmployee[] = [
  { id: "E-101", name: "Employee 101", origin_id: "hku", destination_id: "nanshan-tech", arrival_deadline: "09:30" },
  { id: "E-102", name: "Employee 102", origin_id: "central", destination_id: "nanshan-tech", arrival_deadline: "09:30" },
  { id: "E-103", name: "Employee 103", origin_id: "hku", destination_id: "futian-cbd", arrival_deadline: "10:00" },
  { id: "E-104", name: "Employee 104", origin_id: "kowloon-tong", destination_id: "nanshan-tech", arrival_deadline: "09:45" },
];


export function LegacyEmployeeBatchPage() {
  const locations = useQuery({
    queryKey: queryKeys.locations,
    queryFn: fetchLocations,
    staleTime: Infinity,
  });
  const context = useDemoContext();
  const shadowSummary = useModelShadowSummary();
  const batch = useBatchPlans(COMPANY);
  const [date, setDate] = useState("");
  const [employees, setEmployees] = useState<BatchEmployee[]>(INITIAL_EMPLOYEES);
  const [batchPriority, setBatchPriority] = useState<Priority>("balanced");
  const [batchBudget, setBatchBudget] = useState("");
  const [csvMessage, setCsvMessage] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [portFilter, setPortFilter] = useState("all");
  const initialized = useRef(false);

  useEffect(() => {
    if (!context.data || initialized.current) {
      return;
    }
    const suggested = context.data.suggested_target_time;
    initialized.current = true;
    setDate(suggested.slice(0, 10));
    setEmployees((current) => current.map((employee) => ({
      ...employee,
      arrival_deadline: suggested.slice(11, 16),
    })));
  }, [context.data]);

  function updateEmployee(index: number, patch: Partial<BatchEmployee>) {
    setEmployees((current) => current.map(
      (employee, itemIndex) => itemIndex === index ? { ...employee, ...patch } : employee,
    ));
  }

  function addEmployee() {
    const number = employees.length + 101;
    setEmployees((current) => [
      ...current,
      {
        id: `E-${number}`,
        name: `Employee ${number}`,
        origin_id: "hku",
        destination_id: "nanshan-tech",
        arrival_deadline: "09:30",
      },
    ]);
  }

  async function generatePlan() {
    try {
      await batch.generate({
        company: COMPANY,
        date,
        employees,
        preferences: {
          priority: batchPriority,
          max_budget: batchBudget === "" ? null : Number(batchBudget),
        },
      });
    } catch {
      // The mutation exposes the normalized API error below the editor.
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void generatePlan();
  }

  async function importCsv(file: File | undefined) {
    if (!file) return;
    const result = await validateBatchCsv(await file.text());
    if (result.valid) {
      setEmployees(result.employees);
      setCsvMessage(`Imported ${result.employees.length} employees.`);
    } else {
      setCsvMessage(result.errors.map((item) => `Row ${item.row}: ${item.message}`).join("; "));
    }
  }

  function loadHistory(request: Record<string, unknown>) {
    const saved = request as unknown as BatchRequest;
    setDate(saved.date);
    setEmployees(saved.employees);
    setBatchPriority(saved.preferences?.priority ?? "balanced");
    setBatchBudget(saved.preferences?.max_budget?.toString() ?? "");
    batch.clearPlan();
  }

  if (locations.isPending || context.isPending || batch.loading) {
    return <PageSkeleton cards={3} />;
  }

  return (
    <main className="page">
      <div className="pageIntro">
        <span className="sectionKicker">HR operations · Employee mobility</span>
        <h1>Employee Planning Control Tower</h1>
        <p>Plan employee cross-border commutes in batches, manage individual preferences and budgets, and export auditable dispatch results.</p>
      </div>
      <form className={styles.editor} onSubmit={handleSubmit}>
        <div className={styles.editorHeading}>
          <div>
            <h2>{COMPANY}</h2>
            <p>{employees.length} employees</p>
          </div>
          <label>
            <span>Service date</span>
            <input
              required
              type="date"
              min={context.data?.current_time.slice(0, 10)}
              max={context.data?.max_target_time.slice(0, 10)}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <div className={styles.batchPreferences}>
            <label>
              <span>Default route preference</span>
              <select value={batchPriority} onChange={(event) => setBatchPriority(event.target.value as Priority)}>
                <option value="balanced">Balanced</option>
                <option value="fastest">Fastest</option>
                <option value="cheapest">Lowest cost</option>
              </select>
            </label>
            <label>
              <span>Default budget cap (HK$)</span>
              <input min="0" type="number" value={batchBudget} placeholder="No limit" onChange={(event) => setBatchBudget(event.target.value)} />
            </label>
          </div>
        </div>
        <div className={styles.employeeTable}>
          {employees.map((employee, index) => (
            <div className={styles.employeeRow} key={String(employee.id)}>
              <input
                aria-label={`Employee ${index + 1} name`}
                required
                value={employee.name}
                onChange={(event) => updateEmployee(index, { name: event.target.value })}
              />
              <select
                aria-label={`Employee ${index + 1} origin`}
                required
                value={employee.origin_id}
                onChange={(event) => {
                  const originId = event.target.value;
                  const direction = locations.data?.directions.find(
                    (item) => item.origin_ids.includes(originId),
                  );
                  updateEmployee(index, {
                    origin_id: originId,
                    destination_id: direction?.destination_ids[0] ?? employee.destination_id,
                  });
                }}
              >
                {locations.data?.origins.map((item) => (
                  <option value={item.id} key={item.id}>{item.name}</option>
                ))}
              </select>
              <select
                aria-label={`Employee ${index + 1} destination`}
                required
                value={employee.destination_id}
                onChange={(event) => updateEmployee(index, { destination_id: event.target.value })}
              >
                {locations.data?.destinations.filter((item) => {
                  const direction = locations.data?.directions.find(
                    (candidate) => candidate.origin_ids.includes(employee.origin_id),
                  );
                  return direction?.destination_ids.includes(item.id);
                }).map((item) => (
                  <option value={item.id} key={item.id}>{item.name}</option>
                ))}
              </select>
              <input
                aria-label={`Employee ${index + 1} arrival time`}
                type="time"
                required
                value={employee.arrival_deadline}
                onChange={(event) => updateEmployee(index, { arrival_deadline: event.target.value })}
              />
              <select
                aria-label={`Employee ${index + 1} route preference`}
                value={employee.preferences?.priority ?? "batch"}
                onChange={(event) => {
                  const value = event.target.value;
                  updateEmployee(index, {
                    preferences: value === "batch"
                      ? undefined
                      : {
                        priority: value as Priority,
                        max_budget: employee.preferences?.max_budget ?? null,
                      },
                  });
                }}
              >
                <option value="batch">Use batch default</option>
                <option value="balanced">Individual: Balanced</option>
                <option value="fastest">Individual: Fastest</option>
                <option value="cheapest">Individual: Lowest cost</option>
              </select>
              <input
                aria-label={`Employee ${index + 1} budget cap`}
                min="0"
                type="number"
                disabled={!employee.preferences}
                value={employee.preferences?.max_budget ?? ""}
                placeholder="Batch default"
                onChange={(event) => updateEmployee(index, {
                  preferences: {
                    priority: employee.preferences?.priority ?? batchPriority,
                    max_budget: event.target.value === "" ? null : Number(event.target.value),
                  },
                })}
              />
              <button
                type="button"
                className={styles.remove}
                onClick={() => setEmployees((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                disabled={employees.length === 1}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
        <div className={styles.editorActions}>
          <label className={styles.add}>
            Import CSV
            <input
              hidden
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void importCsv(event.target.files?.[0])}
            />
          </label>
          <button type="button" className={styles.add} onClick={addEmployee}>+ Add employee</button>
          <button className="button buttonDark" disabled={batch.generating}>
            {batch.generating ? "Generating…" : batch.plan ? "Regenerate plan" : "Generate dispatch plan"}
          </button>
        </div>
        {batch.error && <p className="formError">{batch.error}</p>}
        {csvMessage && <p className={csvMessage.startsWith("Imported") ? "formSuccess" : "formError"}>{csvMessage}</p>}
      </form>

      {batch.plan && (
        <section className={styles.result}>
          <div className={styles.editorActions}>
            <select aria-label="Risk filter" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
              <option value="all">All risks</option>
              <option value="high">High risk</option>
              <option value="over_budget">Over budget</option>
            </select>
            <select aria-label="Port filter" value={portFilter} onChange={(event) => setPortFilter(event.target.value)}>
              <option value="all">All ports</option>
              {[...new Set(batch.plan.plan.map((item) => item.recommended_port))].map((port) => (
                <option key={port}>{port}</option>
              ))}
            </select>
            <button type="button" onClick={() => void downloadBatchPlan(batch.plan!.plan_id)}>Export current plan</button>
          </div>
          <div className={styles.stats}>
            <div><strong>{batch.plan.summary.employee_count}</strong><span>Employees</span></div>
            <div><strong>{batch.plan.summary.avg_commute_time}</strong><span>Average minutes</span></div>
            <div><strong>{batch.plan.summary.high_risk_count}</strong><span>High risk</span></div>
          </div>
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <span>Employee</span><span>Recommended port</span><span>Departure</span><span>Commute time</span><span>Risk</span><span>Preference / budget</span>
            </div>
            {batch.plan.plan.filter((item) => (
              (riskFilter === "all"
                || (riskFilter === "high" && item.late_risk_percent >= 20)
                || (riskFilter === "over_budget" && !item.within_budget))
              && (portFilter === "all" || item.recommended_port === portFilter)
            )).map((item) => (
              <div className={styles.tableRow} key={item.employee_id}>
                <strong>{item.employee_id}</strong>
                <span>{item.recommended_port}</span>
                <span>{item.departure_time}</span>
                <span>{item.total_time} minutes</span>
                <span>{item.late_risk_percent}%</span>
                <span>{PRIORITY_LABELS[item.priority]} · {item.max_budget === null ? "No limit" : `HK$${item.max_budget}`}</span>
              </div>
            ))}
          </div>
          <p className={styles.recommendation}>{batch.plan.summary.recommendation}</p>
        </section>
      )}

      <section className={styles.shadowSummary}>
        <div className={styles.shadowHeading}>
          <div><span className="sectionKicker">AI v1 shadow</span><h2>Model Difference Observations</h2></div>
          <span>Does not affect current recommendations</span>
        </div>
        {shadowSummary.isPending && <p>Loading shadow observations…</p>}
        {shadowSummary.error && <p>Shadow observations are temporarily unavailable.</p>}
        {shadowSummary.data && (
          <>
            <div className={styles.shadowStats}>
              <div><strong>{shadowSummary.data.total_observations}</strong><span>Forecast points</span></div>
              <div><strong>{shadowSummary.data.available_observations}</strong><span>AI available</span></div>
              <div><strong>{shadowSummary.data.unavailable_observations}</strong><span>Fallback</span></div>
            </div>
            {shadowSummary.data.ports.length === 0 ? (
              <p>No observations yet. Differences between the statistical model and AI v1 appear after a plan or route forecast is generated.</p>
            ) : (
              <div className={styles.shadowPorts}>
                {shadowSummary.data.ports.map((port) => (
                  <span key={port.port_id}>{port.port_name} · Average absolute difference {port.average_absolute_difference_minutes ?? "—"} minutes</span>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className={styles.history}>
        <div><h2>Recent plans</h2><span>{batch.history.length} total</span></div>
        {batch.history.length === 0 && <p>No enterprise dispatch plans have been saved.</p>}
        {batch.history.map((item) => (
          <article key={item.plan_id}>
            <div>
              <strong>{item.date} · {item.plan_id}</strong>
              <span>{new Date(item.created_at).toLocaleString("en-HK")}</span>
            </div>
            <button onClick={() => loadHistory(item.request)}>Load input</button>
            <button onClick={() => void downloadBatchPlan(item.plan_id)}>Export</button>
          </article>
        ))}
      </section>
    </main>
  );
}
