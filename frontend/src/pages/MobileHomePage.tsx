import { Link } from "react-router-dom";
import { useRealtime } from "../features/realtime/useRealtime";
import { ErrorState } from "../shared/components/PageState";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import styles from "./MobileHomePage.module.css";


export function MobileHomePage() {
  const { data, loading, error } = useRealtime();
  if (loading) return <PageSkeleton cards={3} />;
  if (!data || error) return <ErrorState title="移动首页暂时不可用" detail={error || "请启动后端服务"} />;

  const ranked = [...data.ports].sort((left, right) => left.current_wait - right.current_wait);
  return (
    <main className={styles.mobileShell}>
      <section className={styles.hero}>
        <span>CrossBorder AI · Mobile</span>
        <h1>现在走哪个口岸？</h1>
        <p>课堂 Demo 用同一套 AI 计算，手机端只重新组织信息。</p>
        <div className={styles.best}>
          <div><small>当前最优</small><strong>{data.overview.smoothest_port_name}</strong></div>
          <b>{data.overview.smoothest_wait}<i>分钟</i></b>
        </div>
      </section>

      <section className={styles.sourceStrip} aria-label="数据来源">
        <span>香港官方客流 · 主特征</span>
        <span>深圳官方快照 · 交叉核验</span>
        <small>课堂估算，不是现场实测分钟</small>
      </section>

      <section className={styles.quickGrid}>
        <Link to="/mobile/planner"><strong>立即规划</strong><span>比较四个口岸</span></Link>
        <Link to="/mobile/scenarios"><strong>场景推演</strong><span>暴雨与突发事件</span></Link>
        <Link to="/mobile/feedback"><strong>现场反馈</strong><span>参与透明校准</span></Link>
        <Link to="/mobile/me"><strong>我的通勤</strong><span>提醒、通知与模型</span></Link>
      </section>

      <section className={styles.ports}>
        <div className={styles.sectionTitle}><h2>四口岸态势</h2><span>每60秒更新</span></div>
        {ranked.map((port, index) => (
          <article key={port.id}>
            <b>{index + 1}</b>
            <div><strong>{port.name}</strong><small>{port.status === "open" ? "开放" : "状态提示"} · {port.crowd_level}</small></div>
            <span>{port.current_wait}<i>分</i></span>
          </article>
        ))}
      </section>

    </main>
  );
}
