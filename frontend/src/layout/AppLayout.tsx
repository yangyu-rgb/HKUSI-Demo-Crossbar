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
  { to: "/", label: "Border Situation", shortLabel: "Situation", end: true },
  { to: "/planner", label: "Route Forecast", shortLabel: "Plan", roles: ["operator", "commuter", "business_admin", "transport_dispatcher", "port_official"] },
  { to: "/scenarios", label: "Scenario Lab", shortLabel: "Scenarios", roles: ["operator"] },
  { to: "/crowdsource", label: "Crowd Reports", shortLabel: "Reports", roles: ["operator", "commuter"] },
  { to: "/alerts", label: "Smart Alerts", shortLabel: "Alerts", roles: ["operator", "commuter"] },
  { to: "/business", label: "Operations Control Tower", shortLabel: "Control", roles: ["operator", "business_admin", "transport_dispatcher", "port_official"] },
  { to: "/model", label: "AI Model", shortLabel: "Model", roles: ["operator", "commuter", "business_admin", "transport_dispatcher", "port_official"] },
  { to: "/operations", label: "Operations Analytics", shortLabel: "Analytics", roles: ["operator"] },
  { to: "/pricing", label: "Plans & Pricing", shortLabel: "Pricing" },
  { to: "/mobile", label: "Mobile App", shortLabel: "Mobile", roles: ["commuter"] },
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
  const employeePlanning = item.to === "/business" && session?.role === "business_admin";
  const destination = employeePlanning ? "/business/employees" : item.to;
  const target = locked ? `${loginPath}?next=${encodeURIComponent(item.to)}` : destination;
  const label = employeePlanning ? (mobile ? "Employees" : "Employee Planning") : mobile ? item.shortLabel ?? item.label : item.label;
  return (
    <NavLink to={target} end={item.end} onClick={onSelect} className={({ isActive }) => isActive && !locked ? styles.active : undefined}>
      <span>{label}</span>
      {locked && <small className={styles.lock}>Sign in</small>}
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
  const employeePlanning = session?.role === "business_admin";

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
    if (window.confirm("Reset the Demo to its initial data? All added reports, subscriptions, and enterprise plans will be deleted.")) reset.mutate();
  }

  function logout() {
    clearDemoSession();
    queryClient.clear();
    window.location.assign("/");
  }

  return (
    <div className={`${styles.appShell} ${isHome ? styles.homeShell : styles.contentShell}`}>
      <a className={styles.skipLink} href="#main-content">Skip to main content</a>
      <header className={`${styles.headerWrap} ${isHome ? styles.homeHeader : ""}`}>
        <div className={`${styles.header} liquid-glass ${isHome ? styles.homeSurface : styles.contentSurface}`}>
          <NavLink className={styles.brand} to="/" aria-label="CrossBorder AI home">
            <span className={styles.brandMark}>CB</span>
            <span><strong>CrossBorder AI</strong><small>Hong Kong–Shenzhen Intelligence</small></span>
          </NavLink>
          <nav className={styles.navigation} aria-label="Main navigation">
            {primary.map((item) => <NavigationLink item={item} session={session} key={item.to} />)}
            <div className={styles.menuAnchor} ref={moreRef}>
              <button className={styles.menuTrigger} type="button" aria-expanded={moreOpen} aria-controls="more-navigation" onClick={() => { setMoreOpen((open) => !open); setAccountOpen(false); }}>
                More<MenuChevron />
              </button>
              {moreOpen && <div className={styles.dropdown} id="more-navigation">
                <span className={styles.menuLabel}>More features</span>
                {more.map((item) => <NavigationLink item={item} session={session} key={item.to} onSelect={() => setMoreOpen(false)} />)}
              </div>}
            </div>
          </nav>
          <div className={styles.headerMeta}>
            <time className={styles.platformClock} dateTime={hongKongTime?.toISOString()}>
              <span>Hong Kong time</span><strong>{hongKongTime ? formatHongKongDateTime(hongKongTime, true) : "Syncing"}</strong>
            </time>
            <NavLink className={styles.planCta} to={employeePlanning ? "/business/employees" : session && session.role !== "commuter" ? "/business" : session ? "/planner" : "/login?next=%2Fbusiness"}>{employeePlanning ? "Employee Planning" : session && session.role !== "commuter" ? "Control Tower" : "Start planning"}</NavLink>
            <div className={styles.menuAnchor} ref={accountRef}>
              <button className={styles.accountTrigger} type="button" aria-label="Account and persona" aria-expanded={accountOpen} aria-controls="account-menu" onClick={() => { setAccountOpen((open) => !open); setMoreOpen(false); }}>
                <span>{currentPersona?.name?.slice(0, 1) ?? "G"}</span><MenuChevron />
              </button>
              {accountOpen && <div className={`${styles.dropdown} ${styles.accountMenu}`} id="account-menu">
                <span className={styles.menuLabel}>Current persona</span>
                <strong>{currentPersona?.name ?? "Public visitor"}</strong>
                <small>{session ? "Demo account signed in" : "Sign in for AI and enterprise features"}</small>
                {session?.role === "operator" && <button onClick={handleReset} disabled={reset.isPending}>{reset.isPending ? "Resetting…" : "Reset Demo data"}</button>}
                {session ? <button onClick={logout}>Sign out</button> : <NavLink to="/login">Try the Demo</NavLink>}
              </div>}
            </div>
          </div>
        </div>
      </header>
      <nav className={`${styles.mobileNavigation} liquid-glass`} aria-label="Mobile main navigation">
        {primary.map((item) => <NavigationLink item={item} session={session} mobile key={item.to} />)}
        <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen}><span>More</span></button>
      </nav>
      {moreOpen && <div className={`${styles.mobileMore} liquid-glass`}>{more.map((item) => <NavigationLink item={item} session={session} key={item.to} onSelect={() => setMoreOpen(false)} />)}</div>}
      {reset.isError && <div className={styles.resetError}>{userFacingError(reset.error)}</div>}
      <div className={styles.pageTransition} key={location.pathname} id="main-content" tabIndex={-1}><Outlet /></div>
      <footer className={styles.footer}>
        <strong>CrossBorder AI</strong>
        <span>SIUS2612 Topic 2 · Hong Kong official features · Shenzhen snapshot validation · Not live field measurements</span>
      </footer>
    </div>
  );
}
