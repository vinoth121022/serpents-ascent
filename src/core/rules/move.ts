import type { BoardDefinition, Jump } from '../boards/types';
import { LAST_CELL } from './mapping';
import type { RuleSet } from './ruleset';

export interface MoveResult {
  /** Cells stepped through, in order (serpentine path; bounce retraces). Empty = no movement. */
  path: readonly number[];
  landed: number;
  bounced: boolean;
}

function range(fromInclusive: number, toInclusive: number, step: 1 | -1): number[] {
  const out: number[] = [];
  for (let c = fromInclusive; step > 0 ? c <= toInclusive : c >= toInclusive; c += step) out.push(c);
  return out;
}

/** Resolve a die roll from a cell (0 = off-board start) into a step path. Pure. */
export function computeMove(from: number, die: number, ruleSet: RuleSet): MoveResult {
  // Entry rule: from the off-board start you must roll a 1 or a 6 to step on.
  if (from === 0 && ruleSet.requireEntryRoll && die !== 1 && die !== 6) {
    return { path: [], landed: 0, bounced: false };
  }
  const target = from + die;
  if (target <= LAST_CELL) {
    return { path: range(from + 1, target, 1), landed: target, bounced: false };
  }
  if (!ruleSet.exactRollToWin) {
    // No exact-roll rule: clamp to the final cell.
    return { path: range(from + 1, LAST_CELL, 1), landed: LAST_CELL, bounced: false };
  }
  if (!ruleSet.bounceOnOvershoot) {
    // Exact roll required and no bounce: the token stays put.
    return { path: [], landed: from, bounced: false };
  }
  const landed = 2 * LAST_CELL - target; // 100 - (target - 100)
  const up = range(from + 1, LAST_CELL, 1);
  const down = range(LAST_CELL - 1, landed, -1);
  return { path: [...up, ...down], landed, bounced: true };
}

/** The jump (snake/ladder) starting at `cell`, if any. */
export function findJump(board: BoardDefinition, cell: number): Jump | null {
  return board.jumps.find((j) => j.from === cell) ?? null;
}
