import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { getDemoSession, type DemoRole } from "./session";
import styles from "./RequireAccess.module.css";

const roleNames: Record<DemoRole, string> = {
  operator: "Demo 运营人员",
  commuter: "个人通勤者",
  business_admin: "企业管理员",
};

type RequireAccessProps = {
  allowedRoles: DemoRole[];
  mobile?: boolean;
};

export function RequireAccess({ allowedRoles, mobile = false }: RequireAccessProps) {
  const location = useLocation();
  const session = getDemoSession();
  const next = `${location.pathname}${location.search}`;
  if (!session) {
    const login = mobile ? "/mobile/login" : "/login";
    return <Navigate to={`${login}?next=${encodeURIComponent(next)}`} replace />;
  }
  if (!allowedRoles.includes(session.role)) {
    const login = mobile ? "/mobile/login" : "/login";
    return (
      <main className={mobile ? styles.mobilePage : styles.page}>
        <section className={styles.card}>
          <span>Access policy</span>
          <h1>当前身份无法访问此功能</h1>
          <p>你正在使用“{roleNames[session.role]}”身份，此页面需要{allowedRoles.map((role) => `“${roleNames[role]}”`).join("或")}。</p>
          <div>
            <Link className={styles.primary} to={`${login}?next=${encodeURIComponent(next)}`}>切换登录身份</Link>
            <Link to={mobile ? "/" : "/"}>返回口岸态势</Link>
          </div>
          <small>本权限仅用于课堂 Demo 的角色流程展示，不代表生产认证。</small>
        </section>
      </main>
    );
  }
  return <Outlet />;
}
