import type { BoardDefinition } from './types';

/**
 * Classic Milton Bradley layout (1952), trimmed from 10 snakes to 9 by dropping
 * the short 56->53 snake to meet the 9/9 spec — DECISIONS.md #2.
 */
export const CLASSIC_BOARD: BoardDefinition = {
  size: 10,
  jumps: [
    // 9 ladders (up)
    { from: 1, to: 38, kind: 'ladder' },
    { from: 4, to: 14, kind: 'ladder' },
    { from: 9, to: 31, kind: 'ladder' },
    { from: 21, to: 42, kind: 'ladder' },
    { from: 28, to: 84, kind: 'ladder' },
    { from: 36, to: 44, kind: 'ladder' },
    { from: 51, to: 67, kind: 'ladder' },
    { from: 71, to: 91, kind: 'ladder' },
    { from: 80, to: 100, kind: 'ladder' },
    // 9 snakes (down)
    { from: 16, to: 6, kind: 'snake' },
    { from: 47, to: 26, kind: 'snake' },
    { from: 49, to: 11, kind: 'snake' },
    { from: 62, to: 19, kind: 'snake' },
    { from: 64, to: 60, kind: 'snake' },
    { from: 87, to: 24, kind: 'snake' },
    { from: 93, to: 73, kind: 'snake' },
    { from: 95, to: 75, kind: 'snake' },
    { from: 98, to: 78, kind: 'snake' },
  ],
};
