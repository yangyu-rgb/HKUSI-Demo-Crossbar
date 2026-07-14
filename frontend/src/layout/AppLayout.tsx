import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { getDemoSession, type DemoRole } from "../features/auth/session";
import { useDemoContext, useDemoPersonas, useDemoReset } from "../features/demo/useDemo";
import { useHongKongClock } from "../features/demo/useHongKongClock";
import { clearDemoSession, userFacingError } from "../shared/api/client";
import { formatHongKongDateTime } from "../shared/formatters";
import styles from "./AppLayout.module.css";

type NavigationItem = { to: string; label: string; shortLabel?: string; end?: boolean; roles?: DemoRole[] };

const navigation: NavigationItem[] = [
  { to: "/", label: "口岸态势", shortLabel: "态势", end: true },
  { to: "/planner", label: "路线预测", shortLabel: "规划", roles: ["operator", "commuter", "business_admin", "transport_dispatcher", "port_official"] },
  { to: "/scenarios", label: "场景实验室", shortLabel: "场景", roles: ["operator"] },
  { to: "/crowdsource", label: "众包反馈", shortLabel: "反馈", roles: ["operator", "commuter"] },
  { to: "/alerts", label: "智能提醒", shortLabel: "提醒", roles: ["operator", "commuter"] },
  { to: "/business", label: "运营控制塔", shortLabel: "控制塔", roles: ["operator", "business_admin", "transport_dispatcher", "port_official"] },
  { to: "/model", label: "AI 模型", shortLabel: "模型", roles: ["operator", "commuter", "business_admin", "transport_dispatcher", "port_official"] },
  { to: "/operations", label: "运营分析", shortLabel: "运营", roles: ["operator"] },
  { to: "/pricing", label: "套餐订阅", shortLabel: "订阅" },
  { to: "/mobile", label: "手机版", shortLabel: "手机", roles: ["commuter"] },
];

const rolePrimary: Record<DemoRole | "guest", string[]> = {
  guest: ["/", "/planner", "/model", "/pricing"],
  operator: ["/", "/planner", "/scenarios", "/operations"],
  commuter: ["/", "/planner", "/crowdsource", "/alerts"],
  business_admin: ["/", "/planner", "/business", "/model"],
  transport_dispatcher: ["/business", "/", "/planner", "/model"],
  port_official: ["/business", "/", "/model", "/pricing"],
};

function MenuChevron() {
  return <svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function NavigationLink({ item, session, mobile = false, onSelect }: { item: NavigationItem; session: ReturnType<typeof getDemoSession>; mobile?: boolean; onSelect?: () => void }) {
  const locked = Boolean(item.roles && !session);
  const loginPath = item.to === "/mobile" ? "/mobile/login" : "/login";
  const target = locked ? `${loginPath}?next=${encodeURIComponent(item.to)}` : item.to;
  return (
    <NavLink to={target} end={item.end} onClick={onSelect} className={({ isActive }) => isActive && !locked ? styles.active : undefined}>
      <span>{mobile ? item.shortLabel ?? item.label : item.label}</span>
      {locked && <small className={styles.lock}>登录可用</small>}
    </NavLink>
  );
}

export function AppLayout() {
  const context = useDemoContext();
  const reset = useDemoReset();
  const personas = useDemoPersonas();
  const queryClient = useQueryClient();
  const session = getDemoSession();
  const location = useLocation();
  const hongKongTime = useHongKongClock(context.data?.current_time);
  const currentPersona = personas.data?.personas.find((persona) => persona.id === session?.personaId);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const isHome = location.pathname === "/";

  const visibleNavigation = useMemo(() => navigation.filter((item) => !session || !item.roles || item.roles.includes(session.role)), [session]);
  const primaryPaths = rolePrimary[session?.role ?? "guest"];
  const primary = primaryPaths.map((path) => navigation.find((item) => item.to === path)).filter(Boolean) as NavigationItem[];
  const more = visibleNavigation.filter((item) => !primaryPaths.includes(item.to));

  useEffect(() => {
    setMoreOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function closeMenus(event: MouseEvent) {
      const target = event.target as Node;
      if (!moreRef.current?.contains(target)) setMoreOpen(false);
      if (!accountRef.current?.contains(target)) setAccountOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") { setMoreOpen(false); setAccountOpen(false); }
    }
    document.addEventListener("mousedown", closeMenus);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", closeMenus); document.removeEventListener("keydown", closeOnEscape); };
  }, []);

  function handleReset() {
    if (window.confirm("确定恢复Demo初始数据？所有新增反馈、订阅和企业方案都会删除。")) reset.mutate();
  }

  function logout() {
    clearDemoSession();
    queryClient.clear();
    window.location.assign("/");
  }

  return (
    <div className={styles.appShell}>
      <a className={styles.skipLink} href="#main-content">跳到主要内容</a>
      <header className={`${styles.headerWrap} ${isHome ? styles.homeHeader : ""}`}>
        <div className={`${styles.header} liquid-glass`}>
          <NavLink className={styles.brand} to="/" aria-label="CrossBorder AI 首页">
            <span className={styles.brandMark}>CB</span>
            <span><strong>CrossBorder AI</strong><small>深港跨境智能规划</small></span>
          </NavLink>
          <nav className={styles.navigation} aria-label="主要导航">
            {primary.map((item) => <NavigationLink item={item} session={session} key={item.to} />)}
            <div className={styles.menuAnchor} ref={moreRef}>
              <button className={styles.menuTrigger} type="button" aria-expanded={moreOpen} aria-controls="more-navigation" onClick={() => { setMoreOpen((open) => !open); setAccountOpen(false); }}>
                更多<MenuChevron />
              </button>
              {moreOpen && <div className={styles.dropdown} id="more-navigation">
                <span className={styles.menuLabel}>更多功能</span>
                {more.map((item) => <NavigationLink item={item} session={session} key={item.to} onSelect={() => setMoreOpen(false)} />)}
              </div>}
            </div>
          </nav>
          <div className={styles.headerMeta}>
            <time className={styles.platformClock} dateTime={hongKongTime?.toISOString()}>
              <span>香港时间</span><strong>{hongKongTime ? formatHongKongDateTime(hongKongTime, true) : "同步中"}</strong>
            </time>
            <NavLink className={styles.planCta} to={session && session.role !== "commuter" ? "/business" : session ? "/planner" : "/login?next=%2Fbusiness"}>{session && session.role !== "commuter" ? "运营控制塔" : "开始规划"}</NavLink>
            <div className={styles.menuAnchor} ref={accountRef}>
              <button className={styles.accountTrigger} type="button" aria-label="账户与身份" aria-expanded={accountOpen} aria-controls="account-menu" onClick={() => { setAccountOpen((open) => !open); setMoreOpen(false); }}>
                <span>{currentPersona?.name?.slice(0, 1) ?? "访"}</span><MenuChevron />
              </button>
              {accountOpen && <div className={`${styles.dropdown} ${styles.accountMenu}`} id="account-menu">
                <span className={styles.menuLabel}>当前身份</span>
                <strong>{currentPersona?.name ?? "公开浏览"}</strong>
                <small>{session ? "Demo 账户已登录" : "登录后使用 AI 与企业功能"}</small>
                {session?.role === "operator" && <button onClick={handleReset} disabled={reset.isPending}>{reset.isPending ? "重置中…" : "重置 Demo 数据"}</button>}
                {session ? <button onClick={logout}>退出登录</button> : <NavLink to="/login">登录体验</NavLink>}
              </div>}
            </div>
          </div>
        </div>
      </header>
      <nav className={`${styles.mobileNavigation} liquid-glass`} aria-label="移动端主要导航">
        {primary.map((item) => <NavigationLink item={item} session={session} mobile key={item.to} />)}
        <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen}><span>更多</span></button>
      </nav>
      {moreOpen && <div className={`${styles.mobileMore} liquid-glass`}>{more.map((item) => <NavigationLink item={item} session={session} key={item.to} onSelect={() => setMoreOpen(false)} />)}</div>}
      {reset.isError && <div className={styles.resetError}>{userFacingError(reset.error)}</div>}
      <div className={styles.pageTransition} key={location.pathname} id="main-content" tabIndex={-1}><Outlet /></div>
      <footer className={styles.footer}>
        <strong>CrossBorder AI</strong>
        <span>SIUS2612 Topic 2 · 香港官方主特征 · 深圳官方快照核验 · 非现场实测</span>
      </footer>
    </div>
  );
}
