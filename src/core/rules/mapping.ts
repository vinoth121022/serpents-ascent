/**
 * Cell ↔ grid ↔ world mapping for the 10×10 boustrophedon board.
 * Cell 1 is bottom-left; numbering serpentines up to 100 at top-left.
 */

export const BOARD_SIZE = 10;
export const LAST_CELL = BOARD_SIZE * BOARD_SIZE;
export const TILE_SIZE = 1.0;

export interface GridPos {
  row: number; // 0 = bottom row
  col: number; // 0 = left column
}

export interface WorldPos {
  x: number;
  z: number;
}

export function cellToGrid(n: number): GridPos {
  if (!Number.isInteger(n) || n < 1 || n > LAST_CELL) {
    throw new RangeError(`cell out of range 1..${LAST_CELL}: ${n}`);
  }
  const row = Math.floor((n - 1) / BOARD_SIZE);
  const colInRow = (n - 1) % BOARD_SIZE;
  const col = row % 2 === 0 ? colInRow : BOARD_SIZE - 1 - colInRow;
  return { row, col };
}

/** Board centered at origin; tile tops at y = 0 (engine owns y). */
export function cellToWorld(n: number): WorldPos {
  const { row, col } = cellToGrid(n);
  return {
    x: (col - (BOARD_SIZE - 1) / 2) * TILE_SIZE,
    z: ((BOARD_SIZE - 1) / 2 - row) * TILE_SIZE,
  };
}
