import type { RealtimeResponse } from "./types";
import styles from "./ForecastHeatmap.module.css";


function pressureClass(wait: number) {
  return wait >= 35 ? styles.high : wait >= 18 ? styles.medium : styles.low;
}


export function ForecastHeatmap({ data }: { data: RealtimeResponse }) {
  const bestByTime = data.ports[0].forecast.map((_, index) => Math.min(...data.ports.map((port) => port.forecast[index].wait)));
  const finalBest = data.ports.reduce((best, port) => port.forecast[3].wait < best.forecast[3].wait ? port : best, data.ports[0]);
  const fastest = data.ports.find((port) => port.id === data.overview.fastest_rising_port_id) ?? data.ports[0];
  return (
    <section className={styles.panel} aria-label="四口岸未来三小时压力热力矩阵">
      <div className={styles.heading}><div><span className="sectionKicker">Pressure heatmap</span><h2>四口岸时段压力矩阵</h2><p>颜色越深代表等待压力越高；星标为该时点最低等待。</p></div><div className={styles.live}><i />LIVE · 60秒刷新</div></div>
      <div className={styles.matrix}>
        <div className={styles.corner}>口岸 / 香港时间</div>
        {data.ports[0].forecast.map((point) => <div className={styles.time} key={point.offset_minutes}><strong>{new Date(point.forecast_at).toLocaleTimeString("zh-HK", { hour: "2-digit", minute: "2-digit", hour12: false })}</strong><span>{point.offset_minutes === 0 ? "现在" : `+${point.offset_minutes / 60}h`}</span></div>)}
        {data.ports.map((port) => <div className={styles.row} key={port.id}>
          <div className={styles.port}><strong>{port.name}</strong><span>{port.trend === "rising" ? "↗ 上升" : port.trend === "falling" ? "↘ 回落" : "→ 稳定"}</span></div>
          {port.forecast.map((point, index) => <div className={`${styles.cell} ${pressureClass(point.wait)}`} key={point.offset_minutes}><b>{point.wait}</b><span>分钟</span>{point.wait === bestByTime[index] && <em>★ 最佳</em>}<small>{point.change_from_now === 0 ? "基准" : `${point.change_from_now > 0 ? "+" : ""}${point.change_from_now}`}</small></div>)}
        </div>)}
      </div>
      <div className={styles.insights}>
        <article><span>当前最优</span><strong>{data.overview.smoothest_port_name}</strong><p>{data.overview.smoothest_wait} 分钟，适合立即通关。</p></article>
        <article><span>三小时后最优</span><strong>{finalBest.name}</strong><p>预计 {finalBest.forecast[3].wait} 分钟。</p></article>
        <article className={data.overview.fastest_rising_change > 0 ? styles.warning : undefined}><span>最大变化风险</span><strong>{fastest.name}</strong><p>未来一小时 {data.overview.fastest_rising_change > 0 ? "+" : ""}{data.overview.fastest_rising_change} 分钟。</p></article>
      </div>
    </section>
  );
}
