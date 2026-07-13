import { useModelShadowSummary, useV1Model, useV1Readiness, useV2Model } from "../features/demo/useDemo";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import styles from "./ModelPage.module.css";


type MetricSummary = {
  overall: { mae: number; rmse: number; sample_count: number };
  by_port: Record<string, { mae: number; rmse: number }>;
};

type CandidateResult = {
  algorithm: string;
  parameters: Record<string, number>;
  validation: { mae: number; rmse: number };
  artifact_size_bytes: number;
};


export function ModelPage() {
  const model = useV1Model();
  const readiness = useV1Readiness();
  const shadow = useModelShadowSummary();
  const v2Model = useV2Model();
  if (model.isPending || readiness.isPending || shadow.isPending || v2Model.isPending) {
    return <PageSkeleton cards={3} />;
  }
  if (!model.data || !readiness.data || !shadow.data || !v2Model.data) {
    return <main className="page"><p className="formError">模型状态暂时不可用。</p></main>;
  }
  const metrics = model.data.metrics as unknown as Record<string, { test: MetricSummary }>;
  const candidate = metrics.hist_gradient_boosting.test;
  const calendar = metrics.calendar_mean.test;
  const v2Metrics = v2Model.data.metrics as Record<string, { mae?: number; improvement_percent?: number }>;
  const selection = v2Model.data.selection as { algorithm: string; candidate_count: number; selected_validation_mae: number; minimum_validation_mae: number; rule: string };
  const leaderboard = (v2Model.data.candidate_leaderboard as CandidateResult[]).slice(0, 3);
  const interval = v2Model.data.interval_calibration as { test_coverage_percent: number; average_interval_width_minutes: number; coverage_by_port_percent: Record<string, number> };
  const promotion = v2Model.data.promotion as { passed: boolean; checks: Array<{ name: string; passed: boolean; actual: unknown; required: string }> };
  const dataAudit = v2Model.data.data_audit as { complete_dates: number; warmup_days: number; future_rows_used: number };

  return (
    <main className="page">
      <div className="pageIntro">
        <span className="sectionKicker">AI model lab</span>
        <h1>AI 模型实验室</h1>
        <p>展示由香港官方客流驱动、深圳官方快照核验的 V2.2 透明校准模型。</p>
      </div>
      <section className={styles.grid}>
        <article className={styles.panel}>
          <h2>AI V2.2 透明校准模型</h2>
          <strong className={v2Model.data.artifact_available ? styles.ready : styles.blocked}>{v2Model.data.artifact_available ? "主预测已启用" : "已自动降级"}</strong>
          <div className={styles.stats}>
            <div><strong>{Number(v2Model.data.dataset.sample_count)}</strong><span>公开客流校准样本</span></div>
            <div><strong>{String((v2Model.data.metrics as Record<string, { mae: number }>).test.mae)}</strong><span>时间切分测试 MAE</span></div>
            <div><strong>{v2Model.data.features.length}</strong><span>基础模型特征</span></div>
            <div><strong>{v2Metrics.traffic_ablation_test?.improvement_percent ?? "—"}%</strong><span>客流特征改善</span></div>
          </div>
          <small>基础模型只学习口岸、方向、时间和香港官方客流；天气、事件、官方状态和众包在模型后透明校准。</small>
        </article>
        <article className={styles.panel}>
          <h2>最终模型选择</h2>
          <strong className={promotion.passed ? styles.ready : styles.blocked}>{promotion.passed ? "全部晋级门槛通过" : "已阻止晋级"}</strong>
          <p>{selection.candidate_count} 组候选 · 最终 {selection.algorithm} · 验证 MAE {selection.selected_validation_mae}</p>
          {leaderboard.map((entry, index) => (
            <div className={styles.metric} key={`${entry.algorithm}-${index}`}>
              <span>{index + 1}. {entry.algorithm.replace("hist_gradient_boosting", "HGB").replace("extra_trees", "ExtraTrees")}</span>
              <i style={{ width: `${Math.min(100, entry.validation.mae * 45)}%` }} />
              <b>{entry.validation.mae}</b>
            </div>
          ))}
          <small>{selection.rule}</small>
        </article>
        <article className={styles.panel}>
          <h2>区间校准与数据审计</h2>
          <div className={styles.stats}>
            <div><strong>{interval.test_coverage_percent}%</strong><span>90%区间实际覆盖</span></div>
            <div><strong>{interval.average_interval_width_minutes}</strong><span>平均区间宽度</span></div>
            <div><strong>{dataAudit.complete_dates}</strong><span>完整训练日期</span></div>
          </div>
          <p>56日历史预热 · 未来信息使用 {dataAudit.future_rows_used} 条 · 四口岸覆盖均通过。</p>
          <small>校准版本：{v2Model.data.calibration_version}</small>
        </article>
        <article className={`${styles.panel} ${styles.wide}`}>
          <h2>模型晋级检查</h2>
          <div className={styles.checks}>
            {promotion.checks.map((check) => (
              <p key={check.name}>{check.passed ? "✓" : "○"} {check.name} · {String(typeof check.actual === "object" ? JSON.stringify(check.actual) : check.actual)} · 要求 {check.required}</p>
            ))}
          </div>
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
          <h2>冻结的 V1 合成数据指标</h2>
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
        <article className={`${styles.panel} ${styles.wide}`}>
          <h2>技术版：最终等待怎样算</h2>
          <p><code>B = HGB(口岸、方向、时间、星期、香港客流压力)</code></p>
          <p><code>S = B × min(2.10, 天气系数 × 节假日系数 × 事件系数)</code></p>
          <p><code>Q = S × [1 + 官方权重 × (拥堵等级系数 − 1)]</code></p>
          <p><code>P = Q × (1 − W) + 稳健众包值 × W</code>；单人、双人与多人高共识上限分别为 <code>15% / 30% / 45%</code>。</p>
          <small>深圳公开快照不与香港客流相加；两侧不一致时只扩大预测区间并显示警告。</small>
        </article>
        <article className={`${styles.panel} ${styles.wide}`}>
          <h2>大白话：像天气预报一样逐步修正</h2>
          <p>AI 先根据过去同口岸、同方向、相近时间和客流找一个“底数”；暴雨、节假日和突发事件再按公开系数把底数调高；最新官方拥堵状态和同学输入的 Demo 反馈继续纠正；最后比较四条路线的总时间、费用和迟到风险。</p>
          <p>香港数据负责主要计算，深圳市口岸办公开数据负责“对答案”。两边差得越大，系统越保守地放宽区间，而不会把同一批旅客算两次。</p>
          <strong className={styles.ready}>仅用于课堂 Demo，不收集现场真实训练数据</strong>
        </article>
      </section>
    </main>
  );
}
