// ─── Request / Response ───────────────────────────────────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ProxyRequest {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
}

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
}

// ─── Healing ─────────────────────────────────────────────────────────────────

export interface HealingAttempt {
  attempt: number;
  diagnosis: string;
  patch: RequestPatch;
  response: ProxyResponse;
  success: boolean;
}

export interface RequestPatch {
  url?: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
  reasoning: string; // what Claude changed and why
}

// ─── Memory ───────────────────────────────────────────────────────────────────

export interface HealingRecord {
  id: string;
  timestamp: number;
  originalRequest: ProxyRequest;
  finalRequest: ProxyRequest;
  patch: RequestPatch;
  errorStatus: number;
  errorBody: unknown;
  apiHost: string; // e.g. "api.github.com" — used for lookup
  success: boolean;
  attempts: number;
}

export interface MemoryStore {
  records: HealingRecord[];
}

// ─── Result ───────────────────────────────────────────────────────────────────

export interface ProxyResult {
  success: boolean;
  response: ProxyResponse;
  healed: boolean;
  attempts: number;
  patch?: RequestPatch;
  diagnosis?: string;
  durationMs: number;
}
