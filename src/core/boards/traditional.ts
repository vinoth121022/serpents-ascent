import type { BoardDefinition } from './types';

/**
 * Traditional Paramapadham-style layout used for real matches: no jump sits on
 * the first cell (1) or reaches the last cell (100) — you start clean and must
 * climb the final stretch yourself. 9 ladders / 9 snakes, no chained jumps
 * (validated on load by validateBoard).
 */
export const TRADITIONAL_BOARD: BoardDefinition = {
  size: 10,
  jumps: [
    // 9 ladders (up) — none start at 1, none reach 100
    { from: 7, to: 28, kind: 'ladder' },
    { from: 15, to: 34, kind: 'ladder' },
    { from: 21, to: 42, kind: 'ladder' },
    { from: 36, to: 57, kind: 'ladder' },
    { from: 43, to: 64, kind: 'ladder' },
    { from: 51, to: 72, kind: 'ladder' },
    { from: 67, to: 86, kind: 'ladder' },
    { from: 78, to: 94, kind: 'ladder' },
    { from: 84, to: 97, kind: 'ladder' },
    // 9 snakes (down)
    { from: 25, to: 4, kind: 'snake' },
    { from: 33, to: 12, kind: 'snake' },
    { from: 47, to: 18, kind: 'snake' },
    { from: 56, to: 37, kind: 'snake' },
    { from: 65, to: 45, kind: 'snake' },
    { from: 73, to: 53, kind: 'snake' },
    { from: 88, to: 69, kind: 'snake' },
    { from: 91, to: 71, kind: 'snake' },
    { from: 95, to: 75, kind: 'snake' },
  ],
};
