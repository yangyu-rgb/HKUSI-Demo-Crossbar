import { NavLink, Outlet } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { getDemoSession, type DemoRole } from "../features/auth/session";
import { useDemoContext, useDemoPersonas, useDemoReset } from "../features/demo/useDemo";
import { useHongKongClock } from "../features/demo/useHongKongClock";
import { clearDemoSession, userFacingError } from "../shared/api/client";
import { formatHongKongDateTime } from "../shared/formatters";
import styles from "./AppLayout.module.css";


const navigation = [
  { to: "/", label: "口岸态势", end: true },
  { to: "/planner", label: "路线预测", roles: ["operator", "commuter", "business_admin"] },
  { to: "/scenarios", label: "场景实验室", roles: ["operator"] },
  { to: "/crowdsource", label: "众包反馈", roles: ["operator", "commuter"] },
  { to: "/alerts", label: "智能提醒", roles: ["operator", "commuter"] },
  { to: "/business", label: "企业方案", roles: ["operator", "business_admin"] },
  { to: "/model", label: "AI 模型", roles: ["operator", "commuter", "business_admin"] },
  { to: "/operations", label: "运营分析", roles: ["operator"] },
  { to: "/pricing", label: "套餐订阅" },
  { to: "/mobile", label: "手机版", roles: ["commuter"] },
] satisfies Array<{ to: string; label: string; end?: boolean; roles?: DemoRole[] }>;


export function AppLayout() {
  const context = useDemoContext();
  const reset = useDemoReset();
  const personas = useDemoPersonas();
  const queryClient = useQueryClient();
  const session = getDemoSession();
  const hongKongTime = useHongKongClock(context.data?.current_time);
  const currentPersona = personas.data?.personas.find((persona) => persona.id === session?.personaId);

  function handleReset() {
    if (window.confirm("确定恢复Demo初始数据？所有新增反馈、订阅和企业方案都会删除。")) {
      reset.mutate();
    }
  }

  function logout() {
    clearDemoSession();
    queryClient.clear();
    window.location.assign("/");
  }

  return (
    <>
      <header className={styles.header}>
        <NavLink className={styles.brand} to="/">
          <span className={styles.brandMark}>CB</span>
          <span>
            <strong>CrossBorder AI</strong>
            <small>深港跨境智能规划</small>
          </span>
        </NavLink>
        <nav className={styles.navigation} aria-label="主要导航">
          {navigation.filter((item) => !session || !item.roles || item.roles.includes(session.role)).map((item) => {
            const locked = Boolean(item.roles && !session);
            const loginPath = item.to === "/mobile" ? "/mobile/login" : "/login";
            const target = locked ? `${loginPath}?next=${encodeURIComponent(item.to)}` : item.to;
            return (
            <NavLink
              key={item.to}
              to={target}
              end={item.end}
              className={({ isActive }) => isActive ? styles.active : undefined}
            >
              {item.label}{locked && <span className={styles.lock} aria-label="登录后可用"> 🔒</span>}
            </NavLink>
            );
          })}
        </nav>
        <time className={styles.platformClock} dateTime={hongKongTime?.toISOString()}>
          <span>香港时间</span>
          <strong>{hongKongTime ? formatHongKongDateTime(hongKongTime, true) : "同步中"}</strong>
        </time>
        <div className={styles.demoControls}>
          <span className={styles.demoChip}>{currentPersona?.name ?? "公开浏览"}</span>
          {session?.role === "operator" && <button onClick={handleReset} disabled={reset.isPending}>重置</button>}
          {session ? <button onClick={logout}>退出</button> : <NavLink to="/login">登录</NavLink>}
        </div>
      </header>
      {reset.isError && (
        <div className={styles.resetError}>{userFacingError(reset.error)}</div>
      )}
      <Outlet />
      <footer className={styles.footer}>
        <strong>CrossBorder AI</strong>
        <span>SIUS2612 Topic 2 · 香港官方主特征 · 深圳官方快照核验 · 非现场实测</span>
      </footer>
    </>
  );
}
