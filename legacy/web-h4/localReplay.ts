// ?replay=local — plays web/fixtures/events.jsonl through the same store at 4×, emitting the same
// WsMessages Core's replay server would. Stand-in for Core only; never used when the server is up.
import type { SceneSnapshot, TrajectoryEvent, WsMessage } from "@/lib/contracts";

export const LOCAL_SPEED = 4;

export async function loadLocalScene(): Promise<SceneSnapshot> {
  const res = await fetch("/api/fixtures/scene.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`local scene.json → ${res.status}`);
  return (await res.json()) as SceneSnapshot;
}

export async function loadLocalEvents(): Promise<TrajectoryEvent[]> {
  const res = await fetch("/api/fixtures/events.jsonl", { cache: "no-store" });
  if (!res.ok) throw new Error(`local events.jsonl → ${res.status}`);
  const text = await res.text();
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as TrajectoryEvent);
}

/** Messages the server would send alongside a recorded event (pause → agent_state + gate, steer → decision). */
function companions(ev: TrajectoryEvent): WsMessage[] {
  switch (ev.kind) {
    case "pause":
      return [
        { t: "agent_state", state: "paused", reason: "scope_violation" },
        { t: "gate", which: "pause", resume_url: "" },
      ];
    case "steer":
      return [{ t: "decision", which: "pause", decision: "steer", text: "stay in /features/schemes", by: "web-1" }];
    case "resume":
      return [{ t: "agent_state", state: "running" }];
    case "done":
      return [{ t: "agent_state", state: "done" }];
    default:
      return [];
  }
}

export interface LocalPlayer {
  stop: () => void;
}

export function playLocal(
  events: TrajectoryEvent[],
  onMessage: (msg: WsMessage) => void,
  speed = LOCAL_SPEED,
): LocalPlayer {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const t0 = events[0]?.ts_ms ?? 0;
  for (const ev of events) {
    const delay = Math.max(0, (ev.ts_ms - t0) / speed);
    timers.push(
      setTimeout(() => {
        onMessage({ t: "traj_event", event: ev });
        for (const m of companions(ev)) onMessage(m);
      }, delay),
    );
  }
  return { stop: () => timers.forEach(clearTimeout) };
}
