import type { JumpKind } from '../boards/types';

export type GameEvent =
  | { type: 'GAME_STARTED'; seed: number; playerNames: readonly string[] }
  | { type: 'ROLLED'; player: number; value: number }
  | { type: 'SIX_FORFEIT'; player: number }
  | { type: 'MOVED'; player: number; from: number; to: number; path: readonly number[]; bounced: boolean }
  | { type: 'JUMPED'; player: number; kind: JumpKind; from: number; to: number }
  | { type: 'CAPTURED'; player: number; victim: number; cell: number }
  | { type: 'EXTRA_TURN'; player: number }
  | { type: 'TURN_PASSED'; player: number; next: number }
  | { type: 'WON'; player: number };
