import { NavLink, Outlet } from "react-router-dom";
import { useDemoContext } from "../features/demo/useDemo";
import { useHongKongClock } from "../features/demo/useHongKongClock";
import { formatClock } from "../shared/formatters";
import { MobileSessionProvider } from "./MobileSession";
import styles from "./MobileLayout.module.css";


const navigation = [
  { to: "/mobile", label: "首页", end: true },
  { to: "/mobile/planner", label: "规划" },
  { to: "/mobile/scenarios", label: "场景" },
  { to: "/mobile/feedback", label: "反馈" },
  { to: "/mobile/me", label: "我的" },
];


export function MobileLayout() {
  const context = useDemoContext();
  const hongKongTime = useHongKongClock(context.data?.current_time);
  return (
    <MobileSessionProvider>
      <div className={styles.viewport}>
        <header className={styles.header}>
          <NavLink to="/mobile" className={styles.brand} aria-label="CrossBorder AI 手机首页">
            <b>CB</b><span><strong>CrossBorder AI</strong><small>Mobile</small></span>
          </NavLink>
          <time dateTime={hongKongTime?.toISOString()}>
            <small>香港时间</small><strong>{hongKongTime ? formatClock(hongKongTime.toISOString()) : "同步中"}</strong>
          </time>
        </header>
        <Outlet />
        <nav className={styles.bottomNav} aria-label="移动快捷导航">
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
      </div>
    </MobileSessionProvider>
  );
}
