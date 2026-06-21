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
  ladderPerRung: 0.36, // slow, deliberate rung-by-rung ascent

  snakeShrink: 0.62, // bite: the piece slowly shrinks away at the head cell
  snakeGrow: 0.85, // slowly re-materialises (pops up) on the destination tile
  snakeJumpHop: 0.9, // a deliberate vault OVER a snake it crosses (lets the clip land)
} as const;

/** Off-board home pads along the left edge of the table. */
export function stagingPosition(playerIndex: number): Vector3 {
  return new Vector3(-6.6, 0, 0.9 - playerIndex * 1.05);
}

/** 2×2 slots so cohabiting human figures stand apart yet stay inside the 1.0 tile
 * (tokens also shrink a little when sharing — see Tokens.tsx). */
const SHARED_OFFSETS = [
  [-0.24, -0.24],
  [0.24, -0.24],
  [-0.24, 0.24],
  [0.24, 0.24],
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
  | { kind: 'hop'; from: Vector3; to: Vector3; duration: number; peak: number; stride?: boolean; jumpOver?: boolean }
  | { kind: 'pause'; duration: number }
  | { kind: 'shake'; at: Vector3; duration: number }
  | { kind: 'slide'; headCell: number; duration: number }
  | { kind: 'shrink'; at: Vector3; duration: number }
  | { kind: 'grow'; at: Vector3; duration: number }
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
    const startCell = must(state.players[playerIndex]).cell;
    // Snake bodies as world-space segments (head → tail) for crossing detection.
    const snakes = state.board.jumps.filter((j) => j.kind === 'snake');
    const snakeHeads = new Set(snakes.map((s) => s.from));
    const snakeSegs = snakes.map((s) => {
      const h = cellToWorld(s.from);
      const t = cellToWorld(s.to);
      return [h.x, h.z, t.x, t.z] as const;
    });
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
      // Crossing a snake mid-walk → vault OVER it with the jump-over-obstacle clip,
      // then resume walking. Triggers when a step passes THROUGH a snake-head cell or
      // crosses a snake's body. LANDING on a head is excluded (that triggers the bite).
      const fromCell = i === 0 ? startCell : must(path[i - 1]);
      const isLanding = i === path.length - 1;
      const jumpOver =
        fromCell >= 1 &&
        !(isLanding && snakeHeads.has(cell)) &&
        ((!isLanding && snakeHeads.has(cell)) ||
          snakeSegs.some((s) => segmentsCross(from.x, from.z, to.x, to.z, s[0], s[1], s[2], s[3])));
      // Walk, don't bounce: a grounded stride (the Figure swings its own legs).
      segments.push({
        kind: 'hop',
        from,
        to,
        duration: jumpOver ? TIMING.snakeJumpHop : TIMING.hopPerCell,
        peak: jumpOver ? 0.22 : 0.03,
        stride: !jumpOver,
        jumpOver,
      });
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
    // Snake bite = a clean shrink-out / grow-in teleport: the piece shrinks away on the
    // head cell, then re-materialises (pops up) on the destination tile. No cross-board
    // leap arc (which read as "jumping off the board").
    const tail = cellToWorld(jump.to);
    const headPos = token.position.clone();
    const rest = tokenRestPosition(jumpedPreview(state, jump), state.current);
    this.start({
      token,
      playerIndex: state.current,
      segments: [
        { kind: 'shrink', at: headPos, duration: TIMING.snakeShrink },
        { kind: 'grow', at: rest, duration: TIMING.snakeGrow },
      ],
      onDone: () => {
        registry.fx?.sparkles(new Vector3(tail.x, 0.4, tail.z));
        onDone();
      },
      index: 0,
      t: 0,
    });
    soundBus.play('snake');
    registry.fx?.puff(new Vector3(headPos.x, 0.25, headPos.z)); // poof at the bite
  }

  private start(plan: Plan): void {
    this.plan = plan;
    registry.movingToken = plan.playerIndex;
  }

  cancel(): void {
    this.plan = null;
    registry.movingToken = null;
    registry.movementMode = null;
  }

  tick(dt: number): void {
    const plan = this.plan;
    if (plan === null) return;
    const segment = plan.segments[plan.index];
    if (segment === undefined) {
      this.finish(plan);
      return;
    }
    // Tell the avatar how to carry itself: climbing, sliding a snake, or striding.
    // shrink/grow are a magical teleport — keep the avatar in its neutral idle pose.
    registry.movementMode =
      segment.kind === 'climb'
        ? 'climb'
        : segment.kind === 'slide' || segment.kind === 'shake' || (segment.kind === 'hop' && segment.jumpOver === true)
          ? 'slide'
          : segment.kind === 'shrink' || segment.kind === 'grow'
            ? null
            : 'walk';
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
    registry.movementMode = null;
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
      case 'shrink': {
        // Bite: collapse to nothing on the head cell, sinking slightly into the tile.
        const e = easeInOut(t);
        const s = Math.max(0.001, 1 - e);
        token.position.set(segment.at.x, segment.at.y - e * 0.12, segment.at.z);
        token.scale.set(s, s, s);
        break;
      }
      case 'grow': {
        // Re-materialise on the destination tile with a little overshoot pop (easeOutBack).
        const c1 = 1.70158;
        const c3 = c1 + 1;
        const p = t - 1;
        const s = Math.max(0.001, 1 + c3 * p * p * p + c1 * p * p);
        token.position.copy(segment.at);
        token.scale.set(s, s, s);
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

/** Do segments A→B and C→D cross (2D, XZ plane)? Interior crossings only — endpoint
 * grazes are ignored so a hop that merely starts/ends near a snake doesn't count. */
function segmentsCross(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number,
): boolean {
  const r1x = bx - ax, r1z = bz - az;
  const r2x = dx - cx, r2z = dz - cz;
  const denom = r1x * r2z - r1z * r2x;
  if (Math.abs(denom) < 1e-6) return false; // parallel / degenerate
  const t = ((cx - ax) * r2z - (cz - az) * r2x) / denom;
  const u = ((cx - ax) * r1z - (cz - az) * r1x) / denom;
  return t > 0.02 && t < 0.98 && u > 0.05 && u < 0.95;
}
