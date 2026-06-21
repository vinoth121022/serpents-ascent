import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, cellToGrid, cellToWorld, LAST_CELL, TILE_SIZE } from '../rules/mapping';

describe('boustrophedon cell mapping (spec §4, exact)', () => {
  it('exports the expected constants', () => {
    expect(BOARD_SIZE).toBe(10);
    expect(LAST_CELL).toBe(100);
    expect(TILE_SIZE).toBe(1.0);
  });

  it('maps the four corners and row turns', () => {
    expect(cellToGrid(1)).toEqual({ row: 0, col: 0 });
    expect(cellToGrid(10)).toEqual({ row: 0, col: 9 });
    expect(cellToGrid(11)).toEqual({ row: 1, col: 9 }); // serpentine: row 1 runs right→left
    expect(cellToGrid(20)).toEqual({ row: 1, col: 0 });
    expect(cellToGrid(21)).toEqual({ row: 2, col: 0 });
    expect(cellToGrid(91)).toEqual({ row: 9, col: 9 }); // row 9 is odd → right→left
    expect(cellToGrid(100)).toEqual({ row: 9, col: 0 });
  });

  it('matches the spec formula for every cell', () => {
    for (let n = 1; n <= 100; n++) {
      const row = Math.floor((n - 1) / 10);
      const colInRow = (n - 1) % 10;
      const col = row % 2 === 0 ? colInRow : 9 - colInRow;
      expect(cellToGrid(n)).toEqual({ row, col });
    }
  });

  it('places world positions on the centered grid', () => {
    expect(cellToWorld(1)).toEqual({ x: -4.5, z: 4.5 });
    expect(cellToWorld(10)).toEqual({ x: 4.5, z: 4.5 });
    expect(cellToWorld(100)).toEqual({ x: -4.5, z: -4.5 });
    expect(cellToWorld(55)).toEqual({ x: 0.5, z: -0.5 }); // row 5 (odd), colInRow 4 → col 5
  });

  it('rejects off-board and non-integer cells', () => {
    expect(() => cellToGrid(0)).toThrow(RangeError);
    expect(() => cellToGrid(101)).toThrow(RangeError);
    expect(() => cellToGrid(1.5)).toThrow(RangeError);
    expect(() => cellToWorld(-3)).toThrow(RangeError);
  });
});
