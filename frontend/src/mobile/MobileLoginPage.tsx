import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { safeNextPath } from "../features/auth/session";
import { useDemoPersonas } from "../features/demo/useDemo";
import { setDemoSession } from "../shared/api/client";
import styles from "./MobileLoginPage.module.css";

export function MobileLoginPage() {
  const personas = useDemoPersonas();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const commuter = personas.data?.personas.find((persona) => persona.role === "commuter");

  function enter() {
    if (!commuter) return;
    queryClient.clear();
    setDemoSession({ personaId: commuter.id, role: "commuter", signedInAt: new Date().toISOString() });
    navigate(safeNextPath(location.search, "/mobile"), { replace: true });
  }

  return (
    <main className={styles.screen}>
      <section className={styles.hero}>
        <div className={styles.brand}><b>CB</b><span><strong>CrossBorder AI</strong><small>Mobile commute</small></span></div>
        <span className={styles.kicker}>个人跨境助手</span>
        <h1>先登录，<br />再开始今天的跨境行程。</h1>
        <p>登录后可规划路线、推演场景、提交现场反馈并管理个人提醒。</p>
        <div className={styles.pulse}><i /><span>四口岸态势持续更新</span></div>
      </section>
      <section className={styles.panel}>
        <span>Personal demo sign in</span>
        <h2>个人通勤空间</h2>
        <p>手机版仅开放个人身份，企业规划与运营分析请返回网页版。</p>
        <article>
          <i>{commuter?.name.slice(0, 1) ?? "个"}</i>
          <div><strong>{commuter?.name ?? "正在载入身份…"}</strong><small>{commuter?.organization_name ?? "个人空间"}</small></div>
          <b>个人</b>
        </article>
        <button onClick={enter} disabled={!commuter}>进入移动端系统 <span>→</span></button>
        <a href="/">先查看网页版口岸态势</a>
        <small>课堂 Demo · 本地身份 · 不连接真实 OAuth</small>
      </section>
    </main>
  );
}
