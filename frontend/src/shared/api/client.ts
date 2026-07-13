import { clearDemoSession, getDemoSession, setDemoSession } from "../../features/auth/session";

export { clearDemoSession, getDemoSession, setDemoSession };

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";


export function getDemoPersonaId(): string {
  return getDemoSession()?.personaId ?? "commuter-user";
}


type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    request_id?: string;
    category?: string;
    retryable?: boolean;
    user_action?: string | null;
  };
};


export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details: unknown = {},
    readonly requestId: string | null = null,
    readonly category: string = "unknown",
    readonly retryable: boolean = false,
    readonly userAction: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}


export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const session = getDemoSession();
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(session ? { "X-Demo-Persona-ID": session.personaId } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? error.message : "无法连接服务器",
      0,
      "NETWORK_ERROR",
    );
  }

  if (!response.ok) {
    let payload: ErrorEnvelope = {};
    try {
      payload = await response.json() as ErrorEnvelope;
    } catch {
      // Non-JSON upstream errors use the status-based fallback below.
    }
    const requestId = payload.error?.request_id
      ?? response.headers.get("X-Request-ID");
    throw new ApiError(
      payload.error?.message ?? `请求失败（${response.status}）`,
      response.status,
      payload.error?.code ?? "HTTP_ERROR",
      payload.error?.details ?? {},
      requestId,
      payload.error?.category ?? "unknown",
      payload.error?.retryable ?? response.status >= 500,
      payload.error?.user_action ?? null,
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}


export function userFacingError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : "发生未知错误";
  }
  if (error.code === "NETWORK_ERROR") {
    return "无法连接服务器，请检查后端是否已启动。";
  }
  if (error.status >= 500) {
    const guidance = error.userAction ?? (error.retryable ? "请稍后重试" : "请联系演示操作员");
    return `服务暂时不可用，${guidance}${error.requestId ? `（请求 ${error.requestId}）` : ""}`;
  }
  return error.message;
}
