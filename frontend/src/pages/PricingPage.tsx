import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getDemoSession } from "../features/auth/session";
import { userFacingError } from "../shared/api/client";
import { PageSkeleton } from "../shared/components/PageSkeleton";
import { useCommercial } from "../features/commercial/useCommercial";
import type { CheckoutInput } from "../features/commercial/api";
import styles from "./PricingPage.module.css";

export function PricingPage() {
  const session = getDemoSession();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const initialCycle = params.get("cycle") === "monthly" ? "monthly" : "yearly";
  const [cycle, setCycle] = useState<"monthly" | "yearly">(initialCycle);
  const [selected, setSelected] = useState<string | null>(session ? params.get("plan") : null);
  const commercial = useCommercial(Boolean(session));
  if (commercial.plans.isPending || (session && commercial.subscription.isPending)) return <PageSkeleton cards={3} />;
  if (!commercial.plans.data) return <main className="page"><p className="formError">{userFacingError(commercial.plans.error)}</p></main>;
  const current = commercial.subscription.data?.subscription;
  const chosen = commercial.plans.data.plans.find((plan) => plan.id === selected);
  const checkout = async () => {
    if (!chosen) return;
    await commercial.checkout.mutateAsync({ plan_id: chosen.id, billing_cycle: cycle } as CheckoutInput);
    setSelected(null);
  };
  const choosePlan = (planId: string) => {
    if (!session) {
      const next = `/pricing?plan=${encodeURIComponent(planId)}&cycle=${cycle}`;
      navigate(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setSelected(planId);
  };
  return (
    <main>
      <section className={styles.hero}><span className="sectionKicker">Commercial demo</span><h1>从预测能力到可购买的<br />跨境运营服务。</h1><p>用清晰套餐展示个人、团队和企业客户如何购买预测、批量调度与运营分析能力。</p><div className={styles.cycle}><button className={cycle === "monthly" ? styles.active : ""} onClick={() => setCycle("monthly")}>月付</button><button className={cycle === "yearly" ? styles.active : ""} onClick={() => setCycle("yearly")}>年付 · 省约17%</button></div></section>
      <section className={styles.page}>
        {current && <div className={styles.current}><div><small>当前本地订阅</small><strong>{current.plan_name} · {current.status === "active" ? "生效中" : "已取消"}</strong><span>模拟收据 {current.receipt_id} · 到期 {new Date(current.renews_at).toLocaleDateString("zh-HK")}</span></div>{current.status === "active" && <button onClick={() => commercial.cancel.mutate()}>取消本地订阅</button>}</div>}
        {!session && <div className={styles.guestNotice}>套餐内容可公开查看；选择方案后需要先登录本地 Demo 身份。</div>}
        <div className={styles.plans}>{commercial.plans.data.plans.map((plan) => { const price = cycle === "monthly" ? plan.monthly_price_hkd : plan.yearly_price_hkd; return <article className={plan.highlighted ? styles.highlighted : ""} key={plan.id}>{plan.highlighted && <b className={styles.popular}>推荐商业方案</b>}<span>{plan.audience}</span><h2>{plan.name}</h2><p>{plan.description}</p><div className={styles.price}><strong>HK${price.toLocaleString()}</strong><small>/{cycle === "monthly" ? "月" : "年"}</small></div><ul>{plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul><button onClick={() => choosePlan(plan.id)}>{!session ? "登录后选择" : current?.plan_id === plan.id && current.status === "active" ? "重新选择周期" : plan.id === "starter" ? "启用免费版" : "模拟购买"}</button></article>; })}</div>
        <section className={styles.businessCase}><div><span className="sectionKicker">Business case</span><h2>商业价值怎样呈现</h2></div><div><article><strong>减少人工改线</strong><span>统一查看四口岸风险与备选路线</span></article><article><strong>降低迟到风险</strong><span>按员工与批次倒推最晚出发</span></article><article><strong>形成数据服务</strong><span>运营分析、CSV与未来 API 用量计费</span></article></div></section>
      </section>
      {chosen && <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="checkout-title"><div><button className={styles.close} aria-label="关闭结账" onClick={() => setSelected(null)}>×</button><span className="sectionKicker">Demo checkout</span><h2 id="checkout-title">确认 {chosen.name} 套餐</h2><p>本页面不会收集银行卡、微信支付或其他真实付款信息。</p><dl><div><dt>计费周期</dt><dd>{cycle === "monthly" ? "按月" : "按年"}</dd></div><div><dt>本次模拟金额</dt><dd>HK${(cycle === "monthly" ? chosen.monthly_price_hkd : chosen.yearly_price_hkd).toLocaleString()}</dd></div><div><dt>支付方式</dt><dd>Demo Payment · 无真实扣款</dd></div></dl><button className={styles.confirm} disabled={commercial.checkout.isPending} onClick={() => void checkout()}>{commercial.checkout.isPending ? "正在生成本地收据…" : "确认模拟结账"}</button>{commercial.checkout.error && <p className="formError">{userFacingError(commercial.checkout.error)}</p>}</div></div>}
    </main>
  );
}
