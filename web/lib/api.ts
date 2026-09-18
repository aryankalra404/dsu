// HTTP to the core. Decisions and claim confirmation go here, never over the WebSocket (MVP.md §6).
import { CORE_BASE_URL } from "@/lib/env";
import type { Claim, Flags, HistoryRow, Recording, RunDetail, Scene } from "@/lib/contracts";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${CORE_BASE_URL}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, `Core is not reachable at ${CORE_BASE_URL}. Start it with: cd core && uv run python main.py`);
  }
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  flags: () => request<Flags>("/flags"),
  recordings: () => request<Recording[]>("/recordings"),
  runs: () => request<HistoryRow[]>("/runs"),
  scene: (id: string) => request<Scene>(`/runs/${id}/scene`),
  detail: (id: string) => request<RunDetail>(`/runs/${id}`),
  agentDiff: (id: string) => request<{ diff: string }>(`/runs/${id}/diff`),
  createRun: (body: {
    repo?: string;
    intent?: string;
    replay?: string | null;
    probe_entry?: string | null;
    happy_input?: string | null;
    github_pr?: string | null;
  }) => post<{ run_id: string }>("/runs", body),
  confirm: (
    id: string,
    body: { claims: Claim[]; scope: string[]; probe_entry: string | null; happy_input: string | null; by: string },
  ) => post<{ ok: true }>(`/runs/${id}/claims/confirm`, body),
  decision: (id: string, body: { which: string; decision: string; text?: string; by: string }) =>
    post<{ ok: true }>(`/runs/${id}/decision`, body),
  saveRecording: (id: string, name: string, title?: string) =>
    post<{ saved: string }>(`/runs/${id}/save-recording`, { name, title }),
};
