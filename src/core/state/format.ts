import { must } from '../util';
import type { GameEvent } from './events';
import type { PlayerState } from './types';

/** Human-readable turn-log lines, e.g. "P2 rolled 6 → climbed ladder to 38". */
export function formatEvent(event: GameEvent, players: readonly PlayerState[]): string {
  const name = (i: number): string => must(players[i], `no player ${i}`).name;
  switch (event.type) {
    case 'GAME_STARTED':
      return `New game — ${event.playerNames.join(' vs ')}`;
    case 'ROLLED':
      return `${name(event.player)} rolled ${event.value}`;
    case 'SIX_FORFEIT':
      return `${name(event.player)} rolled a third 6 — move forfeited`;
    case 'MOVED': {
      const origin = event.from === 0 ? 'onto the board' : `from ${event.from}`;
      const bounce = event.bounced ? ' (bounced off 100!)' : '';
      return `${name(event.player)} moved ${origin} to ${event.to}${bounce}`;
    }
    case 'JUMPED':
      return event.kind === 'ladder'
        ? `${name(event.player)} climbed a ladder to ${event.to}`
        : `${name(event.player)} slid down a snake to ${event.to}`;
    case 'CAPTURED':
      return `${name(event.player)} captured ${name(event.victim)} on ${event.cell}`;
    case 'EXTRA_TURN':
      return `${name(event.player)} rolled a 6 — rolls again`;
    case 'TURN_PASSED':
      return `${name(event.next)}'s turn`;
    case 'WON':
      return `${name(event.player)} wins!`;
  }
}
