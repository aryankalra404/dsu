// HTTP only. Decisions and claim confirmation go here, never over the WebSocket (MVP.md §6).
import { CORE_BASE_URL } from "@/lib/env";
import type { Claim, DecisionBody, SceneSnapshot } from "@/lib/contracts";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!CORE_BASE_URL) throw new ApiError(0, "NEXT_PUBLIC_CORE_BASE_URL is not set");
  const res = await fetch(`${CORE_BASE_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(res.status, `${init?.method ?? "GET"} ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export const getScene = (id: string) => request<SceneSnapshot>(`/runs/${id}/scene`);

export const postDecision = (id: string, body: DecisionBody) =>
  request<unknown>(`/runs/${id}/decision`, { method: "POST", body: JSON.stringify(body) });

export const confirmClaims = (id: string, claims: Claim[]) =>
  request<unknown>(`/runs/${id}/claims/confirm`, { method: "POST", body: JSON.stringify({ claims }) });
