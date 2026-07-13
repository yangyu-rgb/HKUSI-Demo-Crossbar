import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { useDemoPersonas } from "../features/demo/useDemo";
import { safeNextPath } from "../features/auth/session";
import { setDemoSession } from "../shared/api/client";
import styles from "./LoginPage.module.css";

const roleCopy: Record<string, { tag: string; detail: string }> = {
  operator: { tag: "运营控制", detail: "查看场景、模型、错误、商业指标与运营分析。" },
  commuter: { tag: "个人通勤", detail: "规划路线、提交反馈并管理个人提醒。" },
  business_admin: { tag: "企业调度", detail: "批量规划员工路线并展示商业订阅。" },
};

export function LoginPage() {
  const personas = useDemoPersonas();
  const [selected, setSelected] = useState("commuter-user");
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const enter = () => {
    const persona = personas.data?.personas.find((item) => item.id === selected);
    if (!persona || !["operator", "commuter", "business_admin"].includes(persona.role)) return;
    queryClient.clear();
    setDemoSession({ personaId: selected, role: persona.role as "operator" | "commuter" | "business_admin", signedInAt: new Date().toISOString() });
    navigate(safeNextPath(location.search, "/"), { replace: true });
  };
  return (
    <main className={styles.screen}>
      <section className={styles.story}>
        <div className={styles.brand}><b>CB</b><span><strong>CrossBorder AI</strong><small>Predict the border. Plan the journey.</small></span></div>
        <div><span className={styles.kicker}>深港跨境决策平台</span><h1>把口岸不确定性，<br />变成可执行的出发决策。</h1><p>从个人路线到企业调度，同一套 AI 预测、众包校准和运营分析能力贯穿完整商业闭环。</p></div>
        <div className={styles.proof}><article><strong>4</strong><span>跨境口岸</span></article><article><strong>1–3h</strong><span>预测窗口</span></article><article><strong>90%</strong><span>课堂区间目标</span></article></div>
        <small className={styles.boundary}>课堂 Demo · 本地身份 · 不连接真实 OAuth 或生产认证</small>
      </section>
      <section className={styles.loginPanel}>
        <div><span className="sectionKicker">Demo sign in</span><h2>选择你的工作空间</h2><p>无需密码。登录后只显示当前身份可使用的本地演示功能。</p></div>
        <div className={styles.personas}>
          {personas.data?.personas.map((persona) => {
            const copy = roleCopy[persona.role];
            return <button className={selected === persona.id ? styles.selected : ""} onClick={() => setSelected(persona.id)} key={persona.id}><i>{persona.name.slice(0, 1)}</i><span><b>{persona.name}</b><small>{copy?.tag} · {persona.organization_name}</small><em>{copy?.detail}</em></span><u>{selected === persona.id ? "已选择" : "选择"}</u></button>;
          })}
        </div>
        <button className={styles.enter} onClick={enter} disabled={!personas.data}>进入 CrossBorder AI <span>→</span></button>
        <div className={styles.oauth}><span>生产演进接口</span><button disabled>微信登录</button><button disabled>Google OAuth</button></div>
      </section>
    </main>
  );
}
