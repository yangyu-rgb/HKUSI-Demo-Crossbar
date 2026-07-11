import { NavLink, Outlet } from "react-router-dom";
import { useDemoContext, useDemoPersonas, useDemoReset } from "../features/demo/useDemo";
import { useHongKongClock } from "../features/demo/useHongKongClock";
import { getDemoPersonaId, setDemoPersonaId, userFacingError } from "../shared/api/client";
import { formatHongKongDateTime } from "../shared/formatters";
import styles from "./AppLayout.module.css";


const navigation = [
  { to: "/", label: "口岸态势", end: true },
  { to: "/planner", label: "路线预测" },
  { to: "/scenarios", label: "场景实验室" },
  { to: "/crowdsource", label: "众包反馈" },
  { to: "/alerts", label: "智能提醒" },
  { to: "/business", label: "企业方案" },
  { to: "/model", label: "AI 模型" },
];


export function AppLayout() {
  const context = useDemoContext();
  const reset = useDemoReset();
  const personas = useDemoPersonas();
  const hongKongTime = useHongKongClock(context.data?.current_time);

  function handleReset() {
    if (window.confirm("确定恢复Demo初始数据？所有新增反馈、订阅和企业方案都会删除。")) {
      reset.mutate();
    }
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
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => isActive ? styles.active : undefined}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <time className={styles.platformClock} dateTime={hongKongTime?.toISOString()}>
          <span>香港时间</span>
          <strong>{hongKongTime ? formatHongKongDateTime(hongKongTime, true) : "同步中"}</strong>
        </time>
        <div className={styles.demoControls}>
          <select
            aria-label="Demo 身份"
            value={getDemoPersonaId()}
            onChange={(event) => {
              setDemoPersonaId(event.target.value);
              window.location.reload();
            }}
          >
            {personas.data?.personas.map((persona) => (
              <option value={persona.id} key={persona.id}>{persona.name}</option>
            ))}
          </select>
          <span className={styles.demoChip}>Simulated Data</span>
          <button onClick={handleReset} disabled={reset.isPending}>重置</button>
        </div>
      </header>
      {reset.isError && (
        <div className={styles.resetError}>{userFacingError(reset.error)}</div>
      )}
      <Outlet />
      <footer className={styles.footer}>
        <strong>CrossBorder AI</strong>
        <span>SIUS2612 Topic 2 · Hong Kong live clock · Simulated border data</span>
      </footer>
    </>
  );
}
