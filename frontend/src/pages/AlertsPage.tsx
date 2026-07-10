import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { fetchLocations } from "../features/prediction/api";
import type { Priority } from "../features/prediction/types";
import { fetchSubscriptionPreview } from "../features/subscription/api";
import { useSubscriptions } from "../features/subscription/useSubscriptions";
import type { SubscriptionRecord, Weekday } from "../features/subscription/types";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import { formatClock, formatHongKongDateTime } from "../shared/formatters";
import { queryKeys } from "../shared/queryKeys";
import styles from "./AlertsPage.module.css";


const USER_ID = "demo-user";
const DAYS: Array<[Weekday, string]> = [
  ["monday", "周一"],
  ["tuesday", "周二"],
  ["wednesday", "周三"],
  ["thursday", "周四"],
  ["friday", "周五"],
  ["saturday", "周六"],
  ["sunday", "周日"],
];


function formatNextAlert(value: string) {
  if (/^\d{2}:\d{2}$/.test(value) || Number.isNaN(new Date(value).getTime())) {
    return value;
  }
  return formatHongKongDateTime(value);
}


export function AlertsPage() {
  const locations = useQuery({
    queryKey: queryKeys.locations,
    queryFn: fetchLocations,
    staleTime: Infinity,
  });
  const subscriptions = useSubscriptions(USER_ID);
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originId, setOriginId] = useState("hku");
  const [destinationId, setDestinationId] = useState("nanshan-tech");
  const [arrivalDeadline, setArrivalDeadline] = useState("09:30");
  const [priority, setPriority] = useState<Priority>("balanced");
  const [days, setDays] = useState<Weekday[]>(["monday", "wednesday", "friday"]);
  const [advanceReminder, setAdvanceReminder] = useState(true);
  const [anomalyAlert, setAnomalyAlert] = useState(true);
  const [betterRouteAlert, setBetterRouteAlert] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const preview = useQuery({
    queryKey: queryKeys.subscriptionPreview(previewId ?? ""),
    queryFn: () => fetchSubscriptionPreview(previewId!),
    enabled: Boolean(previewId),
  });

  useEffect(() => {
    if (previewId && subscriptions.subscriptions.some((item) => item.subscription_id === previewId)) {
      return;
    }
    setPreviewId(subscriptions.subscriptions[0]?.subscription_id ?? null);
  }, [previewId, subscriptions.subscriptions]);

  function resetForm() {
    setEditingId(null);
    setOriginId("hku");
    setDestinationId("nanshan-tech");
    setArrivalDeadline("09:30");
    setPriority("balanced");
    setDays(["monday", "wednesday", "friday"]);
    setAdvanceReminder(true);
    setAnomalyAlert(true);
    setBetterRouteAlert(true);
  }

  function beginEdit(item: SubscriptionRecord) {
    setEditingId(item.subscription_id);
    setOriginId(item.routine.origin_id);
    setDestinationId(item.routine.destination_id);
    setArrivalDeadline(item.routine.arrival_deadline);
    setPriority(item.routine.priority);
    setDays(item.routine.days);
    setAdvanceReminder(item.alerts.advance_reminder);
    setAnomalyAlert(item.alerts.anomaly_alert);
    setBetterRouteAlert(item.alerts.better_route_alert);
    setPreviewId(item.subscription_id);
    setMessage("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const payload = {
      routine: {
        origin_id: originId,
        destination_id: destinationId,
        days,
        arrival_deadline: arrivalDeadline,
        priority,
      },
      alerts: {
        advance_reminder: advanceReminder,
        anomaly_alert: anomalyAlert,
        better_route_alert: betterRouteAlert,
      },
    };
    try {
      if (editingId) {
        await subscriptions.update({ subscriptionId: editingId, payload });
        setPreviewId(editingId);
        await queryClient.invalidateQueries({
          queryKey: queryKeys.subscriptionPreview(editingId),
        });
        setMessage("订阅已更新。");
      } else {
        const created = await subscriptions.create({ user_id: USER_ID, ...payload });
        setPreviewId(created.subscription_id);
        await queryClient.invalidateQueries({
          queryKey: queryKeys.subscriptionPreview(created.subscription_id),
        });
        setMessage("订阅已创建。");
      }
      resetForm();
    } catch {
      // The mutation exposes the normalized API error below the form.
    }
  }

  async function handleDelete(subscriptionId: string) {
    if (window.confirm("确定删除这条提醒订阅？")) {
      setMessage("");
      try {
        await subscriptions.remove(subscriptionId);
        if (editingId === subscriptionId) {
          resetForm();
        }
      } catch {
        // The mutation exposes the normalized API error below the form.
      }
    }
  }

  if (locations.isPending || subscriptions.loading) {
    return <PageSkeleton cards={2} />;
  }

  return (
    <main className="page">
      <div className="pageIntro">
        <span className="sectionKicker">Proactive alert</span>
        <h1>智能提醒订阅管理</h1>
        <p>创建、编辑和删除跨境通勤提醒；所有订阅保存在本地 SQLite 中。</p>
      </div>
      <section className={styles.grid}>
        <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
          <h2>{editingId ? "编辑订阅" : "新增订阅"}</h2>
          <label>
            <span>出发地</span>
            <select required value={originId} onChange={(event) => setOriginId(event.target.value)}>
              {locations.data?.origins.map((item) => (
                <option value={item.id} key={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>目的地</span>
            <select required value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
              {locations.data?.destinations.map((item) => (
                <option value={item.id} key={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <div className={styles.formRow}>
            <label>
              <span>计划到达</span>
              <input
                type="time"
                required
                value={arrivalDeadline}
                onChange={(event) => setArrivalDeadline(event.target.value)}
              />
            </label>
            <label>
              <span>路线偏好</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                <option value="balanced">稳妥均衡</option>
                <option value="fastest">时间最快</option>
                <option value="cheapest">费用最低</option>
              </select>
            </label>
          </div>
          <fieldset className={styles.days}>
            <legend>通勤日期</legend>
            {DAYS.map(([value, label]) => (
              <label key={value}>
                <input
                  type="checkbox"
                  checked={days.includes(value)}
                  onChange={(event) => setDays(
                    event.target.checked
                      ? [...days, value]
                      : days.filter((day) => day !== value),
                  )}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <div className={styles.alertOptions}>
            <label><input type="checkbox" checked={advanceReminder} onChange={(event) => setAdvanceReminder(event.target.checked)} /> 出发前30分钟</label>
            <label><input type="checkbox" checked={anomalyAlert} onChange={(event) => setAnomalyAlert(event.target.checked)} /> 异常拥堵</label>
            <label><input type="checkbox" checked={betterRouteAlert} onChange={(event) => setBetterRouteAlert(event.target.checked)} /> 更优路线</label>
          </div>
          <div className={styles.actions}>
            <button className="button buttonLight" disabled={subscriptions.saving || days.length === 0}>
              {subscriptions.saving ? "保存中…" : editingId ? "保存修改" : "创建提醒"}
            </button>
            {editingId && (
              <button type="button" className={styles.cancel} onClick={resetForm}>取消</button>
            )}
          </div>
          {message && <p className={styles.success}>{message}</p>}
          {subscriptions.error && <p className={styles.error}>{subscriptions.error}</p>}
        </form>

        <div className={styles.sideColumn}>
          <div className={styles.list}>
            <div className={styles.listHeading}>
              <h2>已有订阅</h2>
              <span>{subscriptions.subscriptions.length} 条</span>
            </div>
            {subscriptions.subscriptions.map((item) => {
            const origin = locations.data?.origins.find((entry) => entry.id === item.routine.origin_id);
            const destination = locations.data?.destinations.find((entry) => entry.id === item.routine.destination_id);
            return (
              <article className={styles.subscription} key={item.subscription_id}>
                <div>
                  <strong>{origin?.name} → {destination?.name}</strong>
                  <span>{item.routine.days.length}天/周 · {item.routine.arrival_deadline}前到达</span>
                </div>
                  <b>下次提醒约 {item.next_alert ? formatNextAlert(item.next_alert) : "已关闭"}</b>
                  <div className={styles.itemActions}>
                  <button onClick={() => setPreviewId(item.subscription_id)}>预览</button>
                  <button onClick={() => beginEdit(item)}>编辑</button>
                  <button onClick={() => void handleDelete(item.subscription_id)} disabled={subscriptions.deleting}>删除</button>
                </div>
              </article>
            );
            })}
          </div>
          <section className={styles.preview}>
            <div className={styles.previewHeading}>
              <div><span className="sectionKicker">Next commute</span><h2>提醒预览</h2></div>
              {preview.data && <b>{preview.data.recommended_port}口岸</b>}
            </div>
            {!previewId && <p>创建或选择一条订阅以查看下一次提醒。</p>}
            {preview.isPending && <p>正在评估下一次通勤…</p>}
            {preview.error && <p className={styles.previewError}>暂时无法生成提醒预览。</p>}
            {preview.data && (
              <>
                <p className={styles.previewMeta}>计划于 {formatHongKongDateTime(preview.data.target_time)} 前到达；最晚建议 {formatClock(preview.data.latest_departure)} 出发。</p>
                <div className={styles.previewCards}>
                  {preview.data.alerts.map((alert) => (
                    <article className={alert.triggered ? styles.previewActive : styles.previewInactive} key={alert.kind}>
                      <div><strong>{alert.title}</strong><span>{alert.triggered ? "将发送" : alert.enabled ? "当前未触发" : "未启用"}</span></div>
                      <p>{alert.message}</p>
                      {alert.scheduled_at && <small>评估/发送时间：{formatHongKongDateTime(alert.scheduled_at)}</small>}
                    </article>
                  ))}
                </div>
                {preview.data.alternative_port && <p className={styles.alternative}>备用口岸：{preview.data.alternative_port}</p>}
              </>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
