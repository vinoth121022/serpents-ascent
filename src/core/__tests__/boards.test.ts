import { describe, expect, it } from 'vitest';
import { CLASSIC_BOARD } from '../boards/classic';
import type { BoardDefinition, Jump } from '../boards/types';
import { validateBoard } from '../boards/validate';

function board(jumps: Jump[], size = 10): BoardDefinition {
  return { size, jumps };
}

describe('classic board', () => {
  it('validates and ships 9 snakes + 9 ladders', () => {
    expect(() => validateBoard(CLASSIC_BOARD)).not.toThrow();
    expect(CLASSIC_BOARD.jumps.filter((j) => j.kind === 'snake')).toHaveLength(9);
    expect(CLASSIC_BOARD.jumps.filter((j) => j.kind === 'ladder')).toHaveLength(9);
  });
});

describe('validateBoard invariants', () => {
  it('rejects unsupported sizes', () => {
    expect(() => validateBoard(board([], 8))).toThrow(/unsupported board size 8/);
  });

  it('rejects jumps from the final cell', () => {
    expect(() => validateBoard(board([{ from: 100, to: 50, kind: 'snake' }]))).toThrow(/source off board/);
  });

  it('rejects destinations off the board', () => {
    expect(() => validateBoard(board([{ from: 5, to: 101, kind: 'ladder' }]))).toThrow(/destination off board/);
    expect(() => validateBoard(board([{ from: 5, to: 0, kind: 'snake' }]))).toThrow(/destination off board/);
  });

  it('rejects self-jumps', () => {
    expect(() => validateBoard(board([{ from: 5, to: 5, kind: 'ladder' }]))).toThrow(/jump to itself/);
  });

  it('rejects snakes that go up and ladders that go down', () => {
    expect(() => validateBoard(board([{ from: 5, to: 50, kind: 'snake' }]))).toThrow(/snakes must go down/);
    expect(() => validateBoard(board([{ from: 50, to: 5, kind: 'ladder' }]))).toThrow(/ladders must go up/);
  });

  it('rejects duplicate jump sources', () => {
    expect(() =>
      validateBoard(
        board([
          { from: 5, to: 50, kind: 'ladder' },
          { from: 5, to: 60, kind: 'ladder' },
        ]),
      ),
    ).toThrow(/duplicate jump source 5/);
  });

  it('rejects chained jumps (a destination that is another jump source)', () => {
    expect(() =>
      validateBoard(
        board([
          { from: 5, to: 20, kind: 'ladder' },
          { from: 20, to: 3, kind: 'snake' },
        ]),
      ),
    ).toThrow(/chained jump/);
  });

  it('aggregates multiple errors into one report', () => {
    try {
      validateBoard(
        board(
          [
            { from: 100, to: 5, kind: 'snake' },
            { from: 7, to: 7, kind: 'ladder' },
          ],
          9,
        ),
      );
      expect.unreachable('should have thrown');
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain('unsupported board size');
      expect(message).toContain('source off board');
      expect(message).toContain('jump to itself');
    }
  });
});
