import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBatchPlans } from "../features/business/useBatchPlans";
import type { BatchEmployee, BatchRequest } from "../features/business/types";
import { useDemoContext } from "../features/demo/useDemo";
import { fetchLocations } from "../features/prediction/api";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import { queryKeys } from "../shared/queryKeys";
import styles from "./BusinessPage.module.css";


const COMPANY = "大湾区跨境服务有限公司";
const INITIAL_EMPLOYEES: BatchEmployee[] = [
  { id: "E-101", name: "员工101", origin_id: "hku", destination_id: "nanshan-tech", arrival_deadline: "09:30" },
  { id: "E-102", name: "员工102", origin_id: "central", destination_id: "nanshan-tech", arrival_deadline: "09:30" },
  { id: "E-103", name: "员工103", origin_id: "hku", destination_id: "futian-cbd", arrival_deadline: "10:00" },
  { id: "E-104", name: "员工104", origin_id: "kowloon-tong", destination_id: "nanshan-tech", arrival_deadline: "09:45" },
];


export function BusinessPage() {
  const locations = useQuery({
    queryKey: queryKeys.locations,
    queryFn: fetchLocations,
    staleTime: Infinity,
  });
  const context = useDemoContext();
  const batch = useBatchPlans(COMPANY);
  const [date, setDate] = useState("");
  const [employees, setEmployees] = useState<BatchEmployee[]>(INITIAL_EMPLOYEES);
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
      await batch.generate({ company: COMPANY, date, employees });
    } catch {
      // The mutation exposes the normalized API error below the editor.
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void generatePlan();
  }

  function loadHistory(request: Record<string, unknown>) {
    const saved = request as unknown as BatchRequest;
    setDate(saved.date);
    setEmployees(saved.employees);
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
                onChange={(event) => updateEmployee(index, { origin_id: event.target.value })}
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
                {locations.data?.destinations.map((item) => (
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
          <button type="button" className={styles.add} onClick={addEmployee}>+ 添加员工</button>
          <button className="button buttonDark" disabled={batch.generating}>
            {batch.generating ? "正在生成…" : batch.plan ? "重新生成方案" : "生成调度方案"}
          </button>
        </div>
        {batch.error && <p className="formError">{batch.error}</p>}
      </form>

      {batch.plan && (
        <section className={styles.result}>
          <div className={styles.stats}>
            <div><strong>{batch.plan.summary.employee_count}</strong><span>员工</span></div>
            <div><strong>{batch.plan.summary.avg_commute_time}</strong><span>平均分钟</span></div>
            <div><strong>{batch.plan.summary.high_risk_count}</strong><span>高风险</span></div>
          </div>
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <span>员工</span><span>推荐口岸</span><span>出发时间</span><span>通勤时间</span><span>风险</span>
            </div>
            {batch.plan.plan.map((item) => (
              <div className={styles.tableRow} key={item.employee_id}>
                <strong>{item.employee_id}</strong>
                <span>{item.recommended_port}</span>
                <span>{item.departure_time}</span>
                <span>{item.total_time} 分钟</span>
                <span>{item.late_risk_percent}%</span>
              </div>
            ))}
          </div>
          <p className={styles.recommendation}>{batch.plan.summary.recommendation}</p>
        </section>
      )}

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
          </article>
        ))}
      </section>
    </main>
  );
}
