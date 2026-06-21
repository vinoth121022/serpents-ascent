import { Group, Vector3 } from 'three';
import { cellToWorld, must, type GameState, type Jump } from '../../core';
import { soundBus } from '../../ui/sound/SoundBus';
import { registry } from '../registry';

/** Spec §9 durations — these are contract, not suggestions. */
export const TIMING = {
  hopPerCell: 0.5, // slow, deliberate walking pace (the Figure swings its legs to match)
  hopPeak: 0.35,
  squash: 0.08,
  ladderApproach: 0.3,
  ladderPerRung: 0.18,
  snakeGrab: 0.2,
  snakeSlide: 1.4,
} as const;

/** Off-board home pads along the left edge of the table. */
export function stagingPosition(playerIndex: number): Vector3 {
  return new Vector3(-6.6, 0, 0.9 - playerIndex * 1.05);
}

/** 2×2 micro-offsets so cohabiting tokens never overlap (spec §9). */
const SHARED_OFFSETS = [
  [-0.18, -0.18],
  [0.18, -0.18],
  [-0.18, 0.18],
  [0.18, 0.18],
] as const;

export function tokenRestPosition(state: GameState, playerIndex: number): Vector3 {
  const player = must(state.players[playerIndex]);
  if (player.cell === 0) return stagingPosition(playerIndex);
  const { x, z } = cellToWorld(player.cell);
  const sharers = state.players.filter((p) => p.cell === player.cell);
  if (sharers.length === 1) return new Vector3(x, 0, z);
  const slot = sharers.findIndex((p) => p.id === player.id);
  const [ox, oz] = must(SHARED_OFFSETS[slot % 4]);
  return new Vector3(x + ox, 0, z + oz);
}

type Segment =
  | { kind: 'hop'; from: Vector3; to: Vector3; duration: number; peak: number; stride?: boolean }
  | { kind: 'pause'; duration: number }
  | { kind: 'shake'; at: Vector3; duration: number }
  | { kind: 'slide'; headCell: number; duration: number }
  | { kind: 'climb'; from: Vector3; to: Vector3; duration: number; rungs: number };

interface Plan {
  token: Group;
  playerIndex: number;
  segments: Segment[];
  onDone: () => void;
  index: number;
  t: number;
}

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const tmp = new Vector3();

/**
 * The movement choreographer: a tiny RAF timeline that owns token transforms
 * during moves. Game logic NEVER waits on guesses — completion calls onDone,
 * which dispatches the next FSM transition.
 */
export class Choreographer {
  private plan: Plan | null = null;

  get busy(): boolean {
    return this.plan !== null;
  }

  /** Hop cell-to-cell along the serpentine path (spec: never diagonal shortcuts). */
  planMove(state: GameState, token: Group, onDone: () => void): void {
    const path = state.turn.path;
    const playerIndex = state.current;
    const segments: Segment[] = [];
    let from = token.position.clone();
    for (let i = 0; i < path.length; i++) {
      const cell = must(path[i]);
      const { x, z } = cellToWorld(cell);
      // Final landing uses the shared-cell slot for the *landed* state.
      const to =
        i === path.length - 1
          ? tokenRestPosition(landedPreview(state, playerIndex), playerIndex)
          : new Vector3(x, 0, z);
      // Walk, don't bounce: a grounded stride (the Figure swings its own legs).
      segments.push({ kind: 'hop', from, to, duration: TIMING.hopPerCell, peak: 0.03, stride: true });
      from = to;
    }
    this.start({ token, playerIndex, segments, onDone, index: 0, t: 0 });
  }

  planLadder(state: GameState, jump: Jump, token: Group, onDone: () => void): void {
    const base = cellToWorld(jump.from);
    const top = cellToWorld(jump.to);
    const basePos = new Vector3(base.x, 0.1, base.z);
    const topPos = new Vector3(top.x, 0.1, top.z);
    const rungs = Math.max(3, Math.round(basePos.distanceTo(topPos) / 0.35));
    const rest = tokenRestPosition(jumpedPreview(state, jump), state.current);
    this.start({
      token,
      playerIndex: state.current,
      segments: [
        { kind: 'hop', from: token.position.clone(), to: basePos, duration: TIMING.ladderApproach, peak: 0.2 },
        { kind: 'climb', from: basePos, to: topPos, duration: rungs * TIMING.ladderPerRung, rungs },
        { kind: 'hop', from: topPos, to: rest, duration: 0.24, peak: 0.25 },
      ],
      onDone: () => {
        const at = new Vector3(top.x, 0.4, top.z);
        registry.fx?.sparkles(at);
        registry.fx?.flash(at);
        soundBus.play('ladder');
        onDone();
      },
      index: 0,
      t: 0,
    });
    soundBus.play('step');
  }

  planSnake(state: GameState, jump: Jump, token: Group, onDone: () => void): void {
    const curve = registry.snakeCurves.get(jump.from);
    const tail = cellToWorld(jump.to);
    const rest = tokenRestPosition(jumpedPreview(state, jump), state.current);
    const segments: Segment[] = [
      { kind: 'shake', at: token.position.clone(), duration: TIMING.snakeGrab },
    ];
    if (curve !== undefined) {
      segments.push({ kind: 'slide', headCell: jump.from, duration: TIMING.snakeSlide });
    } else {
      // No registered spline (shouldn't happen) — fall back to a single long hop.
      segments.push({
        kind: 'hop',
        from: token.position.clone(),
        to: new Vector3(tail.x, 0, tail.z),
        duration: TIMING.snakeSlide,
        peak: 0.5,
      });
    }
    segments.push({ kind: 'hop', from: new Vector3(tail.x, 0, tail.z), to: rest, duration: 0.18, peak: 0.12 });
    this.start({
      token,
      playerIndex: state.current,
      segments,
      onDone: () => {
        registry.fx?.puff(new Vector3(tail.x, 0.25, tail.z));
        onDone();
      },
      index: 0,
      t: 0,
    });
    soundBus.play('snake');
  }

  private start(plan: Plan): void {
    this.plan = plan;
    registry.movingToken = plan.playerIndex;
  }

  cancel(): void {
    this.plan = null;
    registry.movingToken = null;
  }

  tick(dt: number): void {
    const plan = this.plan;
    if (plan === null) return;
    const segment = plan.segments[plan.index];
    if (segment === undefined) {
      this.finish(plan);
      return;
    }
    plan.t += dt;
    const duration = segment.duration;
    const t = Math.min(plan.t / duration, 1);
    this.apply(plan, segment, t);
    if (t >= 1) {
      if (segment.kind === 'hop') soundBus.play('step');
      plan.index += 1;
      plan.t = 0;
      if (plan.index >= plan.segments.length) this.finish(plan);
    }
  }

  private finish(plan: Plan): void {
    plan.token.scale.set(1, 1, 1);
    this.plan = null;
    registry.movingToken = null;
    plan.onDone();
  }

  private apply(plan: Plan, segment: Segment, t: number): void {
    const token = plan.token;
    switch (segment.kind) {
      case 'hop': {
        const e = easeInOut(t);
        token.position.lerpVectors(segment.from, segment.to, e);
        if (segment.stride) {
          // Walking: two small footstep bobs per cell, upright (no squash).
          token.position.y += Math.abs(Math.sin(t * Math.PI * 2)) * segment.peak;
          token.scale.set(1, 1, 1);
        } else {
          token.position.y += Math.sin(t * Math.PI) * segment.peak;
          // squash on takeoff/land, stretch at the apex (±8%)
          const stretch = Math.sin(t * Math.PI) * TIMING.squash;
          const squash = (1 - Math.abs(Math.sin(t * Math.PI))) * TIMING.squash;
          token.scale.set(1 + squash - stretch * 0.5, 1 + stretch - squash, 1 + squash - stretch * 0.5);
        }
        break;
      }
      case 'pause':
        break;
      case 'shake': {
        const decay = 1 - t;
        token.position.set(
          segment.at.x + Math.sin(t * 60) * 0.05 * decay,
          segment.at.y,
          segment.at.z + Math.cos(t * 47) * 0.05 * decay,
        );
        break;
      }
      case 'slide': {
        const curve = registry.snakeCurves.get(segment.headCell);
        if (curve === undefined) break;
        curve.getPointAt(easeInOut(t) * 0.999, tmp);
        token.position.set(tmp.x, Math.max(tmp.y - 0.06, 0), tmp.z);
        token.scale.set(1, 0.96, 1);
        break;
      }
      case 'climb': {
        const e = easeInOut(t);
        token.position.lerpVectors(segment.from, segment.to, e);
        // gentle sway as it climbs rung to rung
        token.position.y += Math.abs(Math.sin(t * Math.PI * segment.rungs)) * 0.05;
        const sway = Math.sin(t * Math.PI * segment.rungs) * 0.04;
        token.rotation.z = sway;
        if (t >= 1) token.rotation.z = 0;
        break;
      }
    }
  }
}

/** Preview of the state after landing (for shared-cell slot computation). */
function landedPreview(state: GameState, playerIndex: number): GameState {
  const landed = state.turn.landed ?? must(state.players[playerIndex]).cell;
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerIndex ? { ...p, cell: landed } : p)),
  };
}

function jumpedPreview(state: GameState, jump: Jump): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === state.current ? { ...p, cell: jump.to } : p)),
  };
}
