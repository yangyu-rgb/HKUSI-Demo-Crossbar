export type DemoRole = "operator" | "commuter" | "business_admin" | "transport_dispatcher" | "port_official";

export type DemoSession = {
  personaId: string;
  role: DemoRole;
  signedInAt: string;
};

const SESSION_KEY = "crossborder-demo-session";
const PERSONA_KEY = "crossborder-demo-persona";
const ROLES = new Set<DemoRole>(["operator", "commuter", "business_admin", "transport_dispatcher", "port_official"]);

export function getDemoSession(): DemoSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<DemoSession>;
    if (!value.personaId || !value.signedInAt || !value.role || !ROLES.has(value.role)) {
      clearDemoSession();
      return null;
    }
    return value as DemoSession;
  } catch {
    clearDemoSession();
    return null;
  }
}

export function setDemoSession(session: DemoSession): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.localStorage.setItem(PERSONA_KEY, session.personaId);
}

export function clearDemoSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(PERSONA_KEY);
}

export function safeNextPath(search: string, fallback: string): string {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login") || next.startsWith("/mobile/login")) {
    return fallback;
  }
  return next;
}
