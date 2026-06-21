import { BOARD_SIZE, LAST_CELL } from '../rules/mapping';
import type { BoardDefinition } from './types';

/**
 * Board invariants, checked on load:
 *  - size is 10 (mapping math is 10×10; see DECISIONS.md #15)
 *  - jump endpoints are on-board; nothing jumps from the final cell
 *  - snakes go down, ladders go up, no self-jumps
 *  - one jump per source cell
 *  - no chained jumps: a destination is never another jump's source
 */
export function validateBoard(def: BoardDefinition): void {
  const errors: string[] = [];
  if (def.size !== BOARD_SIZE) {
    errors.push(`unsupported board size ${def.size} (expected ${BOARD_SIZE})`);
  }
  const sources = new Set<number>();
  for (const jump of def.jumps) {
    const tag = `${jump.kind} ${jump.from}->${jump.to}`;
    if (jump.from < 1 || jump.from >= LAST_CELL) errors.push(`${tag}: source off board (1..${LAST_CELL - 1})`);
    if (jump.to < 1 || jump.to > LAST_CELL) errors.push(`${tag}: destination off board (1..${LAST_CELL})`);
    if (jump.to === jump.from) errors.push(`${tag}: jump to itself`);
    if (jump.kind === 'snake' && jump.to > jump.from) errors.push(`${tag}: snakes must go down`);
    if (jump.kind === 'ladder' && jump.to < jump.from) errors.push(`${tag}: ladders must go up`);
    if (sources.has(jump.from)) errors.push(`${tag}: duplicate jump source ${jump.from}`);
    sources.add(jump.from);
  }
  for (const jump of def.jumps) {
    if (sources.has(jump.to)) {
      errors.push(`${jump.kind} ${jump.from}->${jump.to}: chained jump (destination ${jump.to} is another jump's source)`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`invalid board definition:\n  ${errors.join('\n  ')}`);
  }
}
