import { getDemoSession, request } from "../../shared/api/client";
import type {
  BatchHistoryResponse,
  BatchPlanResponse,
  BatchRequest,
  BatchCsvValidateResponse,
} from "./types";


export function createBatchPlan(payload: BatchRequest): Promise<BatchPlanResponse> {
  return request("/api/batch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


export function fetchBatchPlans(company: string): Promise<BatchHistoryResponse> {
  return request(`/api/batch/plans?company=${encodeURIComponent(company)}&limit=10`);
}


export function validateBatchCsv(csvText: string): Promise<BatchCsvValidateResponse> {
  return request("/api/batch/csv/validate", {
    method: "POST",
    body: JSON.stringify({ csv_text: csvText }),
  });
}


export async function downloadBatchPlan(planId: string): Promise<void> {
  const session = getDemoSession();
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000"}/api/batch/plans/${encodeURIComponent(planId)}/export.csv`,
    { headers: session ? { "X-Demo-Persona-ID": session.personaId } : {} },
  );
  if (!response.ok) throw new Error("方案导出失败");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${planId}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
