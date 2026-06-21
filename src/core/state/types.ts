import type { BoardDefinition, Jump } from '../boards/types';
import type { RngState } from '../rng/prng';
import type { RuleSet } from '../rules/ruleset';
import type { GameEvent } from './events';

export type Phase =
  | 'AWAITING_ROLL'
  | 'DICE_ROLLING'
  | 'TOKEN_MOVING'
  | 'RESOLVING_JUMP'
  | 'CHECK_WIN'
  | 'NEXT_TURN'
  | 'WIN';

export interface PlayerState {
  id: number;
  name: string;
  /** 0 = off-board start; 1..100 on the board. */
  cell: number;
}

/** Scratch context for the turn in flight — what the engine animates. */
export interface TurnContext {
  die: number | null;
  path: readonly number[];
  landed: number | null;
  bounced: boolean;
  jump: Jump | null;
  forfeited: boolean;
}

export const EMPTY_TURN: TurnContext = {
  die: null,
  path: [],
  landed: null,
  bounced: false,
  jump: null,
  forfeited: false,
};

export interface GameState {
  phase: Phase;
  board: BoardDefinition;
  ruleSet: RuleSet;
  players: readonly PlayerState[];
  /** Index into players. */
  current: number;
  /** Consecutive sixes by the current player (resets when the turn passes). */
  sixChain: number;
  turn: TurnContext;
  winner: number | null;
  seed: number;
  rng: RngState;
  /** Scripted rolls (replay/verification); consumed before the PRNG. */
  script: readonly number[] | null;
  scriptIndex: number;
  turnNumber: number;
  /** Append-only event log — doubles as the future multiplayer wire protocol. */
  log: readonly GameEvent[];
}

export interface GameConfig {
  playerNames: readonly string[];
  seed: number;
  ruleSet?: Partial<RuleSet>;
  board?: BoardDefinition;
  rollScript?: readonly number[];
}
