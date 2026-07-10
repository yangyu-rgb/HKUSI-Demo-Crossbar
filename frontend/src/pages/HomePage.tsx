import { Link } from "react-router-dom";
import { ForecastChart } from "../features/realtime/ForecastChart";
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

  const reportCount = data.ports.reduce((total, port) => total + port.crowdsource_count, 0);
  return (
    <main>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className="sectionKicker">预测驱动的跨境决策</span>
          <h1>提前看见口岸等待，<br />选择更稳的跨境路线。</h1>
          <p>融合模拟口岸状态、未来三小时预测与现场众包反馈，为深港通勤者提供带置信区间和迟到风险的路线建议。</p>
          <div className={styles.heroActions}>
            <Link className="button buttonPrimary" to="/planner">立即规划路线</Link>
            <span>模拟数据计算于：{formatHongKongDateTime(data.timestamp)}</span>
          </div>
        </div>
        <div className={styles.signal} aria-label="平台能力摘要">
          <div><strong>4</strong><span>核心口岸</span></div>
          <div><strong>3h</strong><span>等待预测</span></div>
          <div><strong>{reportCount}</strong><span>现场样本</span></div>
          <div><strong>±</strong><span>风险区间</span></div>
        </div>
      </section>

      {data.alerts.map((alert) => (
        <div className={styles.alert} key={alert.message}>
          <span>天气与交通提示</span>
          <p>{alert.message}</p>
        </div>
      ))}

      <section className="pageSection">
        <div className="sectionHeading">
          <div><span className="sectionKicker">Simulated border pulse</span><h2>四口岸动态态势</h2></div>
          <div className={styles.refresh}>
            <span>更新于 {new Date(dataUpdatedAt).toLocaleTimeString("zh-HK")}</span>
            <button onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? "刷新中…" : "手动刷新"}
            </button>
          </div>
        </div>
        <div className={styles.portGrid}>
          {data.ports.map((port) => <PortCard port={port} key={port.id} />)}
        </div>
        <ForecastChart data={data} />
      </section>
    </main>
  );
}
