import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { useDemoPersonas } from "../features/demo/useDemo";
import { safeNextPath } from "../features/auth/session";
import { setDemoSession } from "../shared/api/client";
import styles from "./LoginPage.module.css";

const roleCopy: Record<string, { tag: string; detail: string }> = {
  operator: { tag: "Platform Operations / 平台运营", detail: "Switch role views, inspect AI decisions and review operating signals." },
  commuter: { tag: "Personal Mobility / 个人通勤", detail: "Plan routes, submit feedback and manage personal alerts." },
  business_admin: { tag: "Enterprise Client / 企业客户", detail: "Review enterprise dispatch and employee shuttle planning." },
  transport_dispatcher: { tag: "Transport Dispatch / 运输调度", detail: "Predict service, fleet and delivery-window risk, then adopt a plan." },
  port_official: { tag: "Port Coordination / 口岸协调", detail: "Review aggregate pressure and publish a Demo coordination notice." },
};

export function LoginPage() {
  const personas = useDemoPersonas();
  const [selected, setSelected] = useState("coach-dispatcher");
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const enter = () => {
    const persona = personas.data?.personas.find((item) => item.id === selected);
    if (!persona || !["operator", "commuter", "business_admin", "transport_dispatcher", "port_official"].includes(persona.role)) return;
    queryClient.clear();
    setDemoSession({ personaId: selected, role: persona.role as "operator" | "commuter" | "business_admin" | "transport_dispatcher" | "port_official", signedInAt: new Date().toISOString() });
    navigate(safeNextPath(location.search, persona.role === "commuter" ? "/planner" : "/business"), { replace: true });
  };
  return (
    <main className={styles.screen}>
      <section className={styles.story}>
        <div className={styles.brand}><b>CB</b><span><strong>CrossBorder AI</strong><small>Predict the border. Plan the journey.</small></span></div>
        <div><span className={styles.kicker}>AI predictive cross-border operations</span><h1>Turn border uncertainty<br />into dispatch decisions.</h1><p>One forecast engine supports coach services, freight tasks and port coordination. Personal planning remains available as a separate workflow.</p></div>
        <div className={styles.proof}><article><strong>4</strong><span>Border ports</span></article><article><strong>1–3h</strong><span>Forecast horizon</span></article><article><strong>90%</strong><span>Demo interval target</span></article></div>
        <small className={styles.boundary}>Classroom Demo · Local persona only · No OAuth or production authentication</small>
      </section>
      <section className={styles.loginPanel}>
        <div><span className="sectionKicker">Demo sign in</span><h2>Choose your workspace / 选择工作空间</h2><p>No password is required. Each persona only sees its permitted local Demo workflow.</p></div>
        <div className={styles.personas}>
          {personas.data?.personas.map((persona) => {
            const copy = roleCopy[persona.role];
            return <button className={selected === persona.id ? styles.selected : ""} onClick={() => setSelected(persona.id)} key={persona.id}><i>{persona.name.slice(0, 1)}</i><span><b>{persona.name}</b><small>{copy?.tag} · {persona.organization_name}</small><em>{copy?.detail}</em></span><u>{selected === persona.id ? "已选择" : "选择"}</u></button>;
          })}
        </div>
        <button className={styles.enter} onClick={enter} disabled={!personas.data}>Enter CrossBorder AI <span>→</span></button>
        <div className={styles.oauth}><span>Future production interfaces</span><button disabled>WeChat</button><button disabled>Google OAuth</button></div>
      </section>
    </main>
  );
}
