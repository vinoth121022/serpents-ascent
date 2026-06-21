import { describe, expect, it } from 'vitest';
import { CLASSIC_BOARD } from '../boards/classic';
import { computeMove, findJump } from '../rules/move';
import { CLASSIC_RULES } from '../rules/ruleset';

describe('computeMove', () => {
  it('walks the serpentine path cell by cell', () => {
    expect(computeMove(0, 4, CLASSIC_RULES)).toEqual({ path: [1, 2, 3, 4], landed: 4, bounced: false });
    expect(computeMove(9, 3, CLASSIC_RULES)).toEqual({ path: [10, 11, 12], landed: 12, bounced: false });
  });

  it('lands exactly on 100', () => {
    expect(computeMove(94, 6, CLASSIC_RULES)).toEqual({
      path: [95, 96, 97, 98, 99, 100],
      landed: 100,
      bounced: false,
    });
  });

  it('bounces back off 100 on overshoot (98 + 5 → 97)', () => {
    expect(computeMove(98, 5, CLASSIC_RULES)).toEqual({
      path: [99, 100, 99, 98, 97],
      landed: 97,
      bounced: true,
    });
  });

  it('clamps to 100 when exact-roll-to-win is off', () => {
    const rules = { ...CLASSIC_RULES, exactRollToWin: false };
    expect(computeMove(98, 5, rules)).toEqual({ path: [99, 100], landed: 100, bounced: false });
  });

  it('stays put on overshoot when bounce is off', () => {
    const rules = { ...CLASSIC_RULES, bounceOnOvershoot: false };
    expect(computeMove(98, 5, rules)).toEqual({ path: [], landed: 98, bounced: false });
  });

  it('requires a 1 or 6 to enter from the off-board start', () => {
    const rules = { ...CLASSIC_RULES, requireEntryRoll: true };
    // Anything other than 1 or 6 from cell 0 cannot enter — the token stays off.
    expect(computeMove(0, 4, rules)).toEqual({ path: [], landed: 0, bounced: false });
    // A 1 steps onto cell 1; a 6 steps six cells onto cell 6.
    expect(computeMove(0, 1, rules)).toEqual({ path: [1], landed: 1, bounced: false });
    expect(computeMove(0, 6, rules)).toEqual({ path: [1, 2, 3, 4, 5, 6], landed: 6, bounced: false });
  });
});

describe('findJump', () => {
  it('finds ladders and snakes by source cell', () => {
    expect(findJump(CLASSIC_BOARD, 4)).toEqual({ from: 4, to: 14, kind: 'ladder' });
    expect(findJump(CLASSIC_BOARD, 98)).toEqual({ from: 98, to: 78, kind: 'snake' });
  });

  it('returns null when the cell has no jump', () => {
    expect(findJump(CLASSIC_BOARD, 2)).toBeNull();
    expect(findJump(CLASSIC_BOARD, 100)).toBeNull();
  });
});
