import { useModelShadowSummary, useV1Model, useV1Readiness, useV2Model, useV2Readiness } from "../features/demo/useDemo";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import styles from "./ModelPage.module.css";


type MetricSummary = {
  overall: { mae: number; rmse: number; sample_count: number };
  by_port: Record<string, { mae: number; rmse: number }>;
};


export function ModelPage() {
  const model = useV1Model();
  const readiness = useV1Readiness();
  const shadow = useModelShadowSummary();
  const v2 = useV2Readiness();
  const v2Model = useV2Model();
  if (model.isPending || readiness.isPending || shadow.isPending || v2.isPending || v2Model.isPending) {
    return <PageSkeleton cards={3} />;
  }
  if (!model.data || !readiness.data || !shadow.data || !v2.data || !v2Model.data) {
    return <main className="page"><p className="formError">模型状态暂时不可用。</p></main>;
  }
  const metrics = model.data.metrics as unknown as Record<string, { test: MetricSummary }>;
  const candidate = metrics.hist_gradient_boosting.test;
  const calendar = metrics.calendar_mean.test;

  return (
    <main className="page">
      <div className="pageIntro">
        <span className="sectionKicker">AI model lab</span>
        <h1>AI 模型实验室</h1>
        <p>展示直接驱动路线的 V2 场景模型、V1 影子对照，以及独立的研究数据门槛。</p>
      </div>
      <section className={styles.grid}>
        <article className={styles.panel}>
          <h2>AI V2 场景模型</h2>
          <strong className={v2Model.data.artifact_available ? styles.ready : styles.blocked}>{v2Model.data.artifact_available ? "主预测已启用" : "已自动降级"}</strong>
          <div className={styles.stats}>
            <div><strong>{Number(v2Model.data.dataset.sample_count)}</strong><span>合成场景样本</span></div>
            <div><strong>{String((v2Model.data.metrics as Record<string, { mae: number }>).test.mae)}</strong><span>时间切分测试 MAE</span></div>
            <div><strong>{v2Model.data.features.length}</strong><span>场景特征</span></div>
          </div>
          <small>天气、事件、方向和时间共同进入模型；仅用于课堂场景演示。</small>
        </article>
        <article className={styles.panel}>
          <h2>V1 Demo readiness</h2>
          <strong className={readiness.data.demo_ready ? styles.ready : styles.blocked}>
            {readiness.data.demo_ready ? "可完整演示" : "尚未就绪"}
          </strong>
          {readiness.data.checks.map((check) => (
            <p key={check.name}>{check.passed ? "✓" : "○"} {check.name} · {check.detail}</p>
          ))}
        </article>
        <article className={styles.panel}>
          <h2>合成数据离线指标</h2>
          <div className={styles.stats}>
            <div><strong>{candidate.overall.mae}</strong><span>HGB 测试 MAE</span></div>
            <div><strong>{candidate.overall.rmse}</strong><span>HGB 测试 RMSE</span></div>
            <div><strong>{calendar.overall.mae}</strong><span>日历基线 MAE</span></div>
          </div>
          <small>{Number(model.data.dataset.sample_count)} 条合成样本，仅作工程参考。</small>
        </article>
        <article className={styles.panel}>
          <h2>分口岸 MAE</h2>
          {Object.entries(candidate.by_port).map(([port, value]) => (
            <div className={styles.metric} key={port}>
              <span>{port}</span><i style={{ width: `${Math.min(100, value.mae * 40)}%` }} /><b>{value.mae}</b>
            </div>
          ))}
        </article>
        <article className={styles.panel}>
          <h2>运行时影子差异</h2>
          <p>产物：{model.data.artifact_available ? "已加载" : `不可用（${model.data.unavailable_reason}）`}</p>
          <p>{shadow.data.available_observations}/{shadow.data.total_observations} 个影子预测点可用。</p>
          {shadow.data.ports.map((port) => (
            <p key={port.port_id}>{port.port_name} · 平均绝对差 {port.average_absolute_difference_minutes ?? "—"} 分钟</p>
          ))}
        </article>
        <article className={styles.panel}>
          <h2>研究/生产数据门槛</h2>
          <p>{v2.data.label_count}/200 条真实授权标签；当前{v2.data.experiment_ready ? "可开展真实数据实验" : "仅限课堂场景模型"}。</p>
          <p>该门槛不阻止合成场景 V2 演示，但继续阻止真实效果或生产准确率声明。</p>
        </article>
        <article className={`${styles.panel} ${styles.wide}`}>
          <h2>官方特征来源</h2>
          <div className={styles.stats}>
            <div><strong>{v2.data.external_data.feature_observation_count}</strong><span>可用特征观测</span></div>
            <div><strong>{v2.data.external_data.ports.length}/4</strong><span>口岸覆盖</span></div>
            <div><strong>{v2.data.external_data.success_rate_percent ?? "—"}%</strong><span>采集成功率</span></div>
          </div>
          <p>
            官方拥堵等级与客流只作真实特征；计入分钟标签：
            {v2.data.external_data.minute_labels_from_official_features} 条。
          </p>
          <p>
            点时快照完整率：{v2.data.external_data.forecast_snapshot_coverage_percent ?? "—"}% ·
            官方等级一致率：{String(v2.data.external_data.alignment.agreement_percent ?? "—")}%
          </p>
          <div className={styles.sources}>
            {v2.data.external_data.sources.map((source) => (
              <div key={source.id}>
                <b>{source.name}</b>
                <span>
                  {source.status} · {source.freshness_status} · {source.observation_count} 条观测
                  {source.completeness_24h_percent !== null
                    ? ` · 24h ${source.completeness_24h_percent}%`
                    : ""}
                </span>
                <small>{source.reason}</small>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
