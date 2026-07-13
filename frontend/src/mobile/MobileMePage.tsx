import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useV2Model } from "../features/demo/useDemo";
import { fetchLocations } from "../features/prediction/api";
import type { Priority } from "../features/prediction/types";
import { fetchNotifications, fetchSubscriptionPreview, markNotificationRead, runAlertCycle } from "../features/subscription/api";
import type { SubscriptionRecord, Weekday } from "../features/subscription/types";
import { useSubscriptions } from "../features/subscription/useSubscriptions";
import { getDemoPersonaId, userFacingError } from "../shared/api/client";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import { formatClock, formatHongKongDateTime } from "../shared/formatters";
import { queryKeys } from "../shared/queryKeys";
import styles from "./MobilePages.module.css";


const days: Array<[Weekday, string]> = [["monday","一"],["tuesday","二"],["wednesday","三"],["thursday","四"],["friday","五"],["saturday","六"],["sunday","日"]];
type Tab = "alerts" | "notifications" | "model";


export function MobileMePage() {
  const userId = getDemoPersonaId();
  const client = useQueryClient();
  const locations = useQuery({ queryKey: queryKeys.locations, queryFn: fetchLocations, staleTime: Infinity });
  const subscriptions = useSubscriptions(userId);
  const model = useV2Model();
  const notifications = useQuery({ queryKey: queryKeys.notifications(userId), queryFn: () => fetchNotifications(userId) });
  const [tab, setTab] = useState<Tab>("alerts");
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [originId, setOriginId] = useState("hku");
  const [destinationId, setDestinationId] = useState("nanshan-tech");
  const [arrival, setArrival] = useState("09:30");
  const [priority, setPriority] = useState<Priority>("balanced");
  const [selectedDays, setSelectedDays] = useState<Weekday[]>(["monday","wednesday","friday"]);
  const preview = useQuery({ queryKey: queryKeys.subscriptionPreview(selected ?? ""), queryFn: () => fetchSubscriptionPreview(selected!), enabled: Boolean(selected) });
  const cycle = useMutation({ mutationFn: () => runAlertCycle(userId), onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.notifications(userId) }) });
  const read = useMutation({ mutationFn: markNotificationRead, onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.notifications(userId) }) });
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!selected && subscriptions.subscriptions[0]) setSelected(subscriptions.subscriptions[0].subscription_id);
  }, [selected, subscriptions.subscriptions]);

  const direction = locations.data?.directions.find((item) => item.origin_ids.includes(originId));
  const destinations = locations.data?.destinations.filter((item) => direction?.destination_ids.includes(item.id)) ?? [];

  function resetForm() { setEditing(null); setOriginId("hku"); setDestinationId("nanshan-tech"); setArrival("09:30"); setPriority("balanced"); setSelectedDays(["monday","wednesday","friday"]); }
  function edit(item: SubscriptionRecord) { setEditing(item.subscription_id); setSelected(item.subscription_id); setOriginId(item.routine.origin_id); setDestinationId(item.routine.destination_id); setArrival(item.routine.arrival_deadline); setPriority(item.routine.priority); setSelectedDays(item.routine.days); setMessage(""); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const payload = { routine: { origin_id: originId, destination_id: destinationId, days: selectedDays, arrival_deadline: arrival, priority }, alerts: { advance_reminder: true, anomaly_alert: true, better_route_alert: true } };
    try {
      if (editing) { await subscriptions.update({ subscriptionId: editing, payload }); setSelected(editing); setMessage("提醒已更新。"); }
      else { const created = await subscriptions.create({ user_id: userId, ...payload }); setSelected(created.subscription_id); setMessage("提醒已创建。"); }
      resetForm();
    } catch { /* Normalized hook error is rendered below. */ }
  }

  if (locations.isPending || subscriptions.loading || notifications.isPending || model.isPending) return <PageSkeleton cards={2} />;
  const metrics = model.data?.metrics as Record<string, { mae?: number; improvement_percent?: number }> | undefined;
  const interval = model.data?.interval_calibration as { test_coverage_percent?: number } | undefined;

  return (
    <main className={styles.page}>
      <div className={styles.intro}><span>Personal commute</span><h1>我的跨境通勤</h1><p>在手机端管理提醒、查看本地通知，并了解当前 AI 模型。</p></div>
      <div className={styles.tabs} role="tablist" aria-label="我的通勤栏目">
        {([['alerts','提醒'],['notifications',`通知 ${notifications.data?.unread_total || ''}`],['model','模型']] as Array<[Tab,string]>).map(([id,label]) => <button role="tab" aria-selected={tab === id} key={id} onClick={() => setTab(id)}>{label}</button>)}
      </div>

      {tab === "alerts" && <>
        <section className={styles.card}><h2>{editing ? "编辑提醒" : "新增提醒"}</h2><form className={styles.form} onSubmit={submit}>
          <label>出发地<select aria-label="移动提醒出发地" value={originId} onChange={(event) => { const next = event.target.value; const nextDirection = locations.data?.directions.find((item) => item.origin_ids.includes(next)); setOriginId(next); setDestinationId(nextDirection?.destination_ids[0] ?? destinationId); }}>{locations.data?.origins.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>目的地<select aria-label="移动提醒目的地" value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>{destinations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <div className={styles.row}><label>计划到达<input aria-label="移动提醒到达时间" type="time" required value={arrival} onChange={(event) => setArrival(event.target.value)} /></label><label>路线偏好<select aria-label="移动提醒路线偏好" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option value="balanced">稳妥均衡</option><option value="fastest">时间最快</option><option value="cheapest">费用最低</option></select></label></div>
          <div><small>通勤日期</small><div className={styles.checkGrid}>{days.map(([value,label]) => <label key={value}><input type="checkbox" checked={selectedDays.includes(value)} onChange={(event) => setSelectedDays(event.target.checked ? [...selectedDays,value] : selectedDays.filter((day) => day !== value))} />{label}</label>)}</div></div>
          <button className={styles.button} disabled={subscriptions.saving || selectedDays.length === 0}>{subscriptions.saving ? "保存中…" : editing ? "保存修改" : "创建提醒"}</button>
          {editing && <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={resetForm}>取消编辑</button>}
          {message && <p className={styles.message}>{message}</p>}{subscriptions.error && <p className={styles.error}>{subscriptions.error}</p>}
        </form></section>
        <section className={styles.card}><h2>已有提醒</h2><div className={styles.list}>{subscriptions.subscriptions.length === 0 && <p className={styles.empty}>还没有提醒，先创建一条通勤计划。</p>}{subscriptions.subscriptions.map((item) => {
          const origin = locations.data?.origins.find((entry) => entry.id === item.routine.origin_id)?.name;
          const destination = locations.data?.destinations.find((entry) => entry.id === item.routine.destination_id)?.name;
          return <article key={item.subscription_id}><header><strong>{origin} → {destination}</strong><b>{item.routine.arrival_deadline}</b></header><p>{item.routine.days.length} 天/周 · {item.next_alert ? `下次 ${formatHongKongDateTime(item.next_alert)}` : "提醒已关闭"}</p><div className={styles.actions}><button className={styles.secondary} onClick={() => setSelected(item.subscription_id)}>预览</button><button className={styles.secondary} onClick={() => edit(item)}>编辑</button><button className={styles.danger} onClick={() => { if (window.confirm("确定删除这条提醒？")) void subscriptions.remove(item.subscription_id); }}>删除</button></div></article>;
        })}</div></section>
        {selected && <section className={styles.card}><h2>下一次通勤</h2>{preview.isPending && <p className={styles.empty}>正在计算提醒…</p>}{preview.error && <p className={styles.error}>{userFacingError(preview.error)}</p>}{preview.data && <div className={styles.resultHero}><small>{preview.data.commute_date}</small><h2>{preview.data.recommended_port}口岸</h2><p>建议最晚 {formatClock(preview.data.latest_departure)} 出发{preview.data.alternative_port ? `，备选${preview.data.alternative_port}口岸` : ""}。</p></div>}</section>}
      </>}

      {tab === "notifications" && <section className={styles.card}><h2>本地通知</h2><button className={styles.button} disabled={cycle.isPending} onClick={() => cycle.mutate()}>{cycle.isPending ? "正在评估…" : "运行本地告警周期"}</button>{cycle.data && <p className={styles.message}>已评估 {cycle.data.evaluated_subscriptions} 条提醒，新增 {cycle.data.created_notifications} 条通知。</p>}<div className={styles.list}>{notifications.data?.notifications.length === 0 && <p className={styles.empty}>暂时没有通知。</p>}{notifications.data?.notifications.map((item) => <article key={item.id}><header><strong>{item.title}</strong><b>{item.is_read ? "已读" : "未读"}</b></header><p>{item.message}</p>{!item.is_read && <div className={styles.actions}><button className={styles.secondary} onClick={() => read.mutate(item.id)}>标记已读</button></div>}</article>)}</div></section>}

      {tab === "model" && <><section className={styles.resultHero}><small>AI v2.2 · public data hybrid classroom demo</small><h2>{model.data?.artifact_available ? "主预测已启用" : "统计模型降级"}</h2><p>香港官方客流负责基础特征，深圳官方快照只用于交叉核验区间。</p><div className={styles.metrics}><div><strong>{metrics?.test?.mae ?? 1.1368}</strong><span>测试 MAE</span></div><div><strong>{interval?.test_coverage_percent ?? 90.44}%</strong><span>区间覆盖</span></div><div><strong>30%</strong><span>众包上限</span></div></div></section><section className={styles.card}><h2>等待时间怎样算</h2><div className={styles.list}><article><strong>1. AI 学习基础等待</strong><p>按口岸、方向、时间和香港官方客流压力生成底数。</p></article><article><strong>2. 透明校准场景</strong><p>天气、节假日、活动、官方等级和新鲜众包逐步修正。</p></article><article><strong>3. 深圳快照核验区间</strong><p>两侧压力差异越大，预测范围越保守，不重复计算旅客。</p></article></div><p className={styles.message}>所有分钟数均为课堂 Demo 估算，不是现场实测或生产准确率声明。</p></section></>}
    </main>
  );
}
