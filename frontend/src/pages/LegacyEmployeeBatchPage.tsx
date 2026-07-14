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


const COMPANY = "大湾区跨境服务有限公司";
const PRIORITY_LABELS: Record<Priority, string> = {
  balanced: "稳妥均衡",
  fastest: "时间最快",
  cheapest: "费用最低",
};
const INITIAL_EMPLOYEES: BatchEmployee[] = [
  { id: "E-101", name: "员工101", origin_id: "hku", destination_id: "nanshan-tech", arrival_deadline: "09:30" },
  { id: "E-102", name: "员工102", origin_id: "central", destination_id: "nanshan-tech", arrival_deadline: "09:30" },
  { id: "E-103", name: "员工103", origin_id: "hku", destination_id: "futian-cbd", arrival_deadline: "10:00" },
  { id: "E-104", name: "员工104", origin_id: "kowloon-tong", destination_id: "nanshan-tech", arrival_deadline: "09:45" },
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
        name: `员工${number}`,
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
      setCsvMessage(`已导入 ${result.employees.length} 名员工。`);
    } else {
      setCsvMessage(result.errors.map((item) => `第${item.row}行：${item.message}`).join("；"));
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
        <span className="sectionKicker">B2B operations</span>
        <h1>企业批量通勤风险管理</h1>
        <p>编辑员工需求、反复生成调度方案，并从 SQLite 恢复最近的方案输入。</p>
      </div>
      <form className={styles.editor} onSubmit={handleSubmit}>
        <div className={styles.editorHeading}>
          <div>
            <h2>{COMPANY}</h2>
            <p>{employees.length} 名员工</p>
          </div>
          <label>
            <span>服务日期</span>
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
              <span>默认路线偏好</span>
              <select value={batchPriority} onChange={(event) => setBatchPriority(event.target.value as Priority)}>
                <option value="balanced">稳妥均衡</option>
                <option value="fastest">时间最快</option>
                <option value="cheapest">费用最低</option>
              </select>
            </label>
            <label>
              <span>默认预算上限（HK$）</span>
              <input min="0" type="number" value={batchBudget} placeholder="不限" onChange={(event) => setBatchBudget(event.target.value)} />
            </label>
          </div>
        </div>
        <div className={styles.employeeTable}>
          {employees.map((employee, index) => (
            <div className={styles.employeeRow} key={String(employee.id)}>
              <input
                aria-label={`员工${index + 1}姓名`}
                required
                value={employee.name}
                onChange={(event) => updateEmployee(index, { name: event.target.value })}
              />
              <select
                aria-label={`员工${index + 1}出发地`}
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
                aria-label={`员工${index + 1}目的地`}
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
                aria-label={`员工${index + 1}到达时间`}
                type="time"
                required
                value={employee.arrival_deadline}
                onChange={(event) => updateEmployee(index, { arrival_deadline: event.target.value })}
              />
              <select
                aria-label={`员工${index + 1}路线偏好`}
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
                <option value="batch">使用批次默认</option>
                <option value="balanced">个人：稳妥均衡</option>
                <option value="fastest">个人：时间最快</option>
                <option value="cheapest">个人：费用最低</option>
              </select>
              <input
                aria-label={`员工${index + 1}预算上限`}
                min="0"
                type="number"
                disabled={!employee.preferences}
                value={employee.preferences?.max_budget ?? ""}
                placeholder="批次默认"
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
                删除
              </button>
            </div>
          ))}
        </div>
        <div className={styles.editorActions}>
          <label className={styles.add}>
            导入 CSV
            <input
              hidden
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void importCsv(event.target.files?.[0])}
            />
          </label>
          <button type="button" className={styles.add} onClick={addEmployee}>+ 添加员工</button>
          <button className="button buttonDark" disabled={batch.generating}>
            {batch.generating ? "正在生成…" : batch.plan ? "重新生成方案" : "生成调度方案"}
          </button>
        </div>
        {batch.error && <p className="formError">{batch.error}</p>}
        {csvMessage && <p className={csvMessage.startsWith("已导入") ? "formSuccess" : "formError"}>{csvMessage}</p>}
      </form>

      {batch.plan && (
        <section className={styles.result}>
          <div className={styles.editorActions}>
            <select aria-label="风险筛选" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
              <option value="all">全部风险</option>
              <option value="high">高风险</option>
              <option value="over_budget">超预算</option>
            </select>
            <select aria-label="口岸筛选" value={portFilter} onChange={(event) => setPortFilter(event.target.value)}>
              <option value="all">全部口岸</option>
              {[...new Set(batch.plan.plan.map((item) => item.recommended_port))].map((port) => (
                <option key={port}>{port}</option>
              ))}
            </select>
            <button type="button" onClick={() => void downloadBatchPlan(batch.plan!.plan_id)}>导出当前方案</button>
          </div>
          <div className={styles.stats}>
            <div><strong>{batch.plan.summary.employee_count}</strong><span>员工</span></div>
            <div><strong>{batch.plan.summary.avg_commute_time}</strong><span>平均分钟</span></div>
            <div><strong>{batch.plan.summary.high_risk_count}</strong><span>高风险</span></div>
          </div>
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <span>员工</span><span>推荐口岸</span><span>出发时间</span><span>通勤时间</span><span>风险</span><span>偏好/预算</span>
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
                <span>{item.total_time} 分钟</span>
                <span>{item.late_risk_percent}%</span>
                <span>{PRIORITY_LABELS[item.priority]} · {item.max_budget === null ? "不限" : `HK$${item.max_budget}`}</span>
              </div>
            ))}
          </div>
          <p className={styles.recommendation}>{batch.plan.summary.recommendation}</p>
        </section>
      )}

      <section className={styles.shadowSummary}>
        <div className={styles.shadowHeading}>
          <div><span className="sectionKicker">AI v1 shadow</span><h2>模型差异观测</h2></div>
          <span>不影响当前用户推荐</span>
        </div>
        {shadowSummary.isPending && <p>正在读取影子观测…</p>}
        {shadowSummary.error && <p>暂时无法读取影子观测。</p>}
        {shadowSummary.data && (
          <>
            <div className={styles.shadowStats}>
              <div><strong>{shadowSummary.data.total_observations}</strong><span>预测点</span></div>
              <div><strong>{shadowSummary.data.available_observations}</strong><span>AI 可用</span></div>
              <div><strong>{shadowSummary.data.unavailable_observations}</strong><span>已降级</span></div>
            </div>
            {shadowSummary.data.ports.length === 0 ? (
              <p>尚无观测；生成方案或完成路线预测后会在此汇总统计模型与 AI v1 的差异。</p>
            ) : (
              <div className={styles.shadowPorts}>
                {shadowSummary.data.ports.map((port) => (
                  <span key={port.port_id}>{port.port_name} · 平均绝对差 {port.average_absolute_difference_minutes ?? "—"} 分钟</span>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className={styles.history}>
        <div><h2>最近方案</h2><span>{batch.history.length} 条</span></div>
        {batch.history.length === 0 && <p>尚未保存企业调度方案。</p>}
        {batch.history.map((item) => (
          <article key={item.plan_id}>
            <div>
              <strong>{item.date} · {item.plan_id}</strong>
              <span>{new Date(item.created_at).toLocaleString("zh-HK")}</span>
            </div>
            <button onClick={() => loadHistory(item.request)}>载入输入</button>
            <button onClick={() => void downloadBatchPlan(item.plan_id)}>导出</button>
          </article>
        ))}
      </section>
    </main>
  );
}
