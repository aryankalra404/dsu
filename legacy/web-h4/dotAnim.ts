// Shared mutable animation state for the agent dot (DESIGN.md → Motion). Not React state on purpose:
// AgentDot writes it every frame, Trail reads it every frame. The store is the committed truth; this only lags.
import { Vector3 } from "three";

export const dotAnim = {
  pos: new Vector3(),
  /** seq of the trail item the dot has fully arrived at (segments ≤ this draw in full). */
  doneSeq: 0,
  /** seq of the trail item the dot is currently moving towards, or null when idle. */
  movingSeq: null as number | null,
};
