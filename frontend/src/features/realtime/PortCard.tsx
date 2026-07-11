import type { CrowdLevel, PortStatus } from "./types";
import styles from "./PortCard.module.css";


const CROWD_LABELS: Record<CrowdLevel, string> = {
  low: "畅通",
  medium: "正常",
  high: "拥挤",
};


const TREND_LABELS = {
  rising: "持续上升",
  falling: "逐步回落",
  stable: "基本稳定",
};


export function PortCard({ port, rank }: { port: PortStatus; rank: number }) {
  const waits = port.forecast.map((point) => point.wait);
  const minWait = Math.min(...waits);
  const maxWait = Math.max(...waits);
  const range = Math.max(1, maxWait - minWait);
  const points = waits.map((wait, index) => `${8 + index * 28},${43 - ((wait - minWait) / range) * 30}`).join(" ");
  const peakTime = new Date(port.peak_at).toLocaleTimeString("zh-HK", { hour: "2-digit", minute: "2-digit", hour12: false });
  const pressure = Math.min(100, Math.round((port.current_wait / 50) * 100));
  return (
    <article className={`${styles.card} ${styles[port.crowd_level]}`}>
      <div className={styles.top}>
        <div className={styles.title}>
          <span className={`${styles.dot} ${styles[port.crowd_level]}`} aria-hidden="true" />
          <strong>{port.name}</strong>
          <small>{port.name_en}</small>
        </div>
        <div className={styles.badges}><span className={styles.rank}>#{rank}</span><span className={`${styles.crowd} ${styles[port.crowd_level]}`}>{CROWD_LABELS[port.crowd_level]}</span></div>
      </div>
      <div className={styles.wait}>
        <div><span>当前等待</span><strong>{port.current_wait}<small>分钟</small></strong></div>
        <div className={`${styles.trend} ${styles[port.trend]}`}><b>{port.change_next_hour > 0 ? "+" : ""}{port.change_next_hour}</b><span>未来 1h</span></div>
      </div>
      <div className={styles.pressure} aria-label={`压力指数 ${pressure}%`}><span style={{ width: `${pressure}%` }} /></div>
      <div className={styles.sparkline} aria-label={`${port.name}未来三小时迷你趋势`}>
        <svg viewBox="0 0 100 50" role="img"><path d="M8 43 H92" /><polyline points={points} /></svg>
        <div>{port.forecast.map((point) => <span key={point.offset_minutes}><b>{point.wait}</b><small>{point.offset_minutes === 0 ? "现在" : `+${point.offset_minutes / 60}h`}</small></span>)}</div>
      </div>
      <div className={styles.metrics}><div><span>三小时峰值</span><strong>{port.peak_wait} 分</strong><small>{peakTime}</small></div><div><span>趋势判断</span><strong>{TREND_LABELS[port.trend as keyof typeof TREND_LABELS]}</strong><small>90%区间 {port.forecast[1].lower_bound}–{port.forecast[1].upper_bound}</small></div></div>
      {port.anomalies[0] && <p className={styles.anomaly}>{port.anomalies[0]}</p>}
      <div className={styles.meta}>
        <span><i className={styles.liveDot} />{port.status === "open" ? "开放" : port.status}</span>
        <span>{port.special_channels[0]}</span>
        <span>{port.crowdsource_count} 条有效反馈</span>
      </div>
    </article>
  );
}
