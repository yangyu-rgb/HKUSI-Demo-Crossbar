import { getDemoSession, request } from "../../shared/api/client";
import type {
  AdoptedDecisionPlan,
  CoordinationNoticeWrite,
  DecisionPreview,
  EnterprisePlanRequest,
  EnterpriseWorkspace,
  OutcomeWrite,
  PlanList,
  WorkspaceKind,
} from "./types";

function viewQuery(view?: WorkspaceKind): string {
  return view ? `?view_as=${encodeURIComponent(view)}` : "";
}

export function fetchEnterpriseWorkspace(view?: WorkspaceKind): Promise<EnterpriseWorkspace> {
  return request(`/api/enterprise-operations/workspace${viewQuery(view)}`);
}

export function previewEnterpriseDecision(scenarioId: string, view?: WorkspaceKind): Promise<DecisionPreview> {
  return request(`/api/enterprise-operations/previews${viewQuery(view)}`, {
    method: "POST",
    body: JSON.stringify({ scenario_id: scenarioId }),
  });
}

export function adoptEnterpriseDecision(payload: EnterprisePlanRequest, view?: WorkspaceKind): Promise<AdoptedDecisionPlan> {
  return request(`/api/enterprise-operations/plans${viewQuery(view)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchEnterprisePlans(): Promise<PlanList> {
  return request("/api/enterprise-operations/plans?limit=10");
}

export function recordEnterpriseOutcome(planId: string, payload: OutcomeWrite): Promise<AdoptedDecisionPlan> {
  return request(`/api/enterprise-operations/plans/${encodeURIComponent(planId)}/outcome`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createCoordinationNotice(payload: CoordinationNoticeWrite): Promise<unknown> {
  return request("/api/enterprise-operations/coordination-notices", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function downloadEnterprisePlan(planId: string): Promise<void> {
  const session = getDemoSession();
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000"}/api/enterprise-operations/plans/${encodeURIComponent(planId)}/export.csv`,
    { headers: session ? { "X-Demo-Persona-ID": session.personaId } : {} },
  );
  if (!response.ok) throw new Error("运营方案导出失败");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${planId}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
