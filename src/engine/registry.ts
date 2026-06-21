/**
 * Imperative bridge between engine systems that must not round-trip through React
 * state every frame: token refs for the choreographer, snake spline registry for
 * slide animations, particle emitters, renderer info for perf gates.
 */
import type { CatmullRomCurve3, Clock, Group, Vector3, WebGLRenderer } from 'three';

export interface FxApi {
  confetti(at: Vector3): void;
  sparkles(at: Vector3): void;
  puff(at: Vector3): void;
  dustRing(at: Vector3): void;
  /** Brief warm point-light flash (ladder-top celebration). */
  flash(at: Vector3): void;
}

export interface DiceLogEntry {
  /** The value core/ decided before the throw. */
  core: number;
  /** Face read after settle, before any correction. */
  settledFace: number;
  /** Face shown after reconciliation — must always equal `core`. */
  finalFace: number;
  ok: boolean;
  corrected: boolean;
}

export const registry = {
  /** Token group per player index (pawn origin at its base). */
  tokens: [] as (Group | null)[],
  /** Snake spline keyed by head cell — param 0 at the head, 1 at the tail. */
  snakeCurves: new Map<number, CatmullRomCurve3>(),
  fx: null as FxApi | null,
  gl: null as WebGLRenderer | null,
  /** Manual frame driver — lets debug/CI pump fixed-dt frames without rAF. */
  r3f: null as {
    advance: (timestamp: number, runGlobalEffects?: boolean) => void;
    clock: Clock;
    camera: { position: Vector3 };
    scene: { traverse: (cb: (o: unknown) => void) => void };
  } | null,
  /** Rolling frame-time samples (seconds), ring buffer. */
  frameTimes: [] as number[],
  diceLog: [] as DiceLogEntry[],
  userDragging: false,
  /** Player index currently being animated by the choreographer (camera bias). */
  movingToken: null as number | null,
  /** What the moving token is doing right now, so the avatar can pose accordingly. */
  movementMode: null as 'walk' | 'climb' | 'slide' | null,
  /** Player index currently celebrating (ladder-top happy jump) — camera holds on them. */
  celebrating: null as number | null,
  /** World position of the dice tray center — camera focuses here while rolling. */
  diceTrayPos: null as Vector3 | null,
};

export function pushFrameTime(dt: number): void {
  registry.frameTimes.push(dt);
  if (registry.frameTimes.length > 240) registry.frameTimes.shift();
}

export function medianFps(): number {
  if (registry.frameTimes.length === 0) return 60;
  const sorted = [...registry.frameTimes].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)] ?? 1 / 60;
  return 1 / mid;
}
