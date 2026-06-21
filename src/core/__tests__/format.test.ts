import { describe, expect, it } from 'vitest';
import { formatEvent } from '../state/format';
import type { PlayerState } from '../state/types';

const players: PlayerState[] = [
  { id: 0, name: 'Asha', cell: 0 },
  { id: 1, name: 'Ravi', cell: 0 },
];

describe('formatEvent', () => {
  it('formats every event type as a readable log line', () => {
    expect(formatEvent({ type: 'GAME_STARTED', seed: 42, playerNames: ['Asha', 'Ravi'] }, players)).toBe(
      'New game — Asha vs Ravi',
    );
    expect(formatEvent({ type: 'ROLLED', player: 0, value: 6 }, players)).toBe('Asha rolled 6');
    expect(formatEvent({ type: 'SIX_FORFEIT', player: 1 }, players)).toBe('Ravi rolled a third 6 — move forfeited');
    expect(formatEvent({ type: 'MOVED', player: 0, from: 0, to: 4, path: [1, 2, 3, 4], bounced: false }, players)).toBe(
      'Asha moved onto the board to 4',
    );
    expect(
      formatEvent({ type: 'MOVED', player: 0, from: 98, to: 97, path: [99, 100, 99, 98, 97], bounced: true }, players),
    ).toBe('Asha moved from 98 to 97 (bounced off 100!)');
    expect(formatEvent({ type: 'JUMPED', player: 1, kind: 'ladder', from: 4, to: 14 }, players)).toBe(
      'Ravi climbed a ladder to 14',
    );
    expect(formatEvent({ type: 'JUMPED', player: 1, kind: 'snake', from: 16, to: 6 }, players)).toBe(
      'Ravi slid down a snake to 6',
    );
    expect(formatEvent({ type: 'CAPTURED', player: 0, victim: 1, cell: 30 }, players)).toBe(
      'Asha captured Ravi on 30',
    );
    expect(formatEvent({ type: 'EXTRA_TURN', player: 0 }, players)).toBe('Asha rolled a 6 — rolls again');
    expect(formatEvent({ type: 'TURN_PASSED', player: 0, next: 1 }, players)).toBe("Ravi's turn");
    expect(formatEvent({ type: 'WON', player: 1 }, players)).toBe('Ravi wins!');
  });
});
