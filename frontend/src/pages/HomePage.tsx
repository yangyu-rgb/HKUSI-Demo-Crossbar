import { Link } from "react-router-dom";
import { ForecastChart } from "../features/realtime/ForecastChart";
import { ForecastHeatmap } from "../features/realtime/ForecastHeatmap";
import { PortCard } from "../features/realtime/PortCard";
import { useRealtime } from "../features/realtime/useRealtime";
import { ErrorState } from "../shared/components/PageState";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import { formatHongKongDateTime } from "../shared/formatters";
import styles from "./HomePage.module.css";


export function HomePage() {
  const { data, loading, refreshing, error, refresh, dataUpdatedAt } = useRealtime();

  if (loading) {
    return <PageSkeleton />;
  }
  if (error || !data) {
    return <ErrorState title="无法连接 CrossBorder AI 后端" detail={error || "请启动 FastAPI 服务"} />;
  }

  const rankByPort = new Map([...data.ports].sort((left, right) => left.current_wait - right.current_wait).map((port, index) => [port.id, index + 1]));
  const openPortCount = data.ports.filter((port) => port.status === "open").length;
  return (
    <main>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className="sectionKicker">预测驱动的跨境决策</span>
          <h1>提前看见口岸等待，<br />选择更稳的跨境路线。</h1>
          <p>融合模拟口岸状态、未来三小时预测与现场众包反馈，为深港通勤者提供带置信区间和迟到风险的路线建议。</p>
          <div className={styles.heroActions}>
            <Link className="button buttonPrimary" to="/planner">立即规划路线</Link>
            <span className={styles.liveStatus}><i />实时计算中 · {formatHongKongDateTime(data.timestamp)}</span>
          </div>
        </div>
        <div className={styles.signal} aria-label="平台能力摘要">
          <div><strong>{data.overview.smoothest_port_name}</strong><span>当前最畅通 · {data.overview.smoothest_wait}分</span></div>
          <div><strong>{data.overview.highest_pressure_port_name}</strong><span>当前压力最高 · {data.overview.highest_pressure_wait}分</span></div>
          <div><strong>{data.overview.fastest_rising_port_name}</strong><span>未来1h变化 · {data.overview.fastest_rising_change > 0 ? "+" : ""}{data.overview.fastest_rising_change}分</span></div>
          <div><strong>{data.overview.crowdsource_report_count}</strong><span>有效反馈 · {data.overview.active_anomaly_count}项异常</span></div>
        </div>
      </section>

      {data.alerts.map((alert) => (
        <div className={`${styles.alert} ${styles[alert.severity]}`} key={alert.message}>
          <span>{alert.severity === "high" ? "高风险告警" : alert.severity === "medium" ? "态势提醒" : "运行提示"}</span>
          <p>{alert.message}</p>
        </div>
      ))}

      <section className="pageSection">
        <div className="sectionHeading">
          <div><span className="sectionKicker">Simulated border pulse</span><h2>四口岸动态态势</h2></div>
          <div className={styles.refresh}>
            <span>{openPortCount}/4 口岸开放 · 更新于 {new Date(dataUpdatedAt).toLocaleTimeString("zh-HK")}</span>
            <button onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? "刷新中…" : "手动刷新"}
            </button>
          </div>
        </div>
        <div className={styles.portGrid}>
          {data.ports.map((port) => <PortCard port={port} rank={rankByPort.get(port.id) ?? 4} key={port.id} />)}
        </div>
        <ForecastChart data={data} />
        <ForecastHeatmap data={data} />
      </section>
    </main>
  );
}
