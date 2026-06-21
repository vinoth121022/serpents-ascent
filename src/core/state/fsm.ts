/**
 * The game FSM — explicit, pure transition functions:
 *
 *   AWAITING_ROLL → DICE_ROLLING → TOKEN_MOVING → RESOLVING_JUMP? → CHECK_WIN
 *     → (WIN | NEXT_TURN → AWAITING_ROLL)
 *
 * Reducers take a GameState and return a new one (immutably), appending typed
 * events to the log. Illegal transitions throw in strict mode (tests/dev) and
 * no-op with console.error in prod.
 */
import { CLASSIC_BOARD } from '../boards/classic';
import { validateBoard } from '../boards/validate';
import { rollDie, seedRng } from '../rng/prng';
import { LAST_CELL } from '../rules/mapping';
import { computeMove, findJump } from '../rules/move';
import { CLASSIC_RULES } from '../rules/ruleset';
import { must } from '../util';
import type { GameEvent } from './events';
import { EMPTY_TURN, type GameConfig, type GameState, type Phase, type PlayerState } from './types';

let strictMode = true;

/** Strict = illegal transitions throw. The app turns this off in production builds. */
export function setStrictMode(on: boolean): void {
  strictMode = on;
}

function guard(state: GameState, expected: Phase, action: string): boolean {
  if (state.phase === expected) return true;
  const message = `illegal transition: ${action}() in phase ${state.phase} (expected ${expected})`;
  if (strictMode) throw new Error(message);
  console.error(message);
  return false;
}

function withEvents(state: GameState, events: readonly GameEvent[]): GameState {
  return { ...state, log: [...state.log, ...events] };
}

function currentPlayer(state: GameState): PlayerState {
  return must(state.players[state.current], `no player at index ${state.current}`);
}

export function createGame(config: GameConfig): GameState {
  if (config.playerNames.length < 2 || config.playerNames.length > 4) {
    throw new RangeError(`player count must be 2..4, got ${config.playerNames.length}`);
  }
  const board = config.board ?? CLASSIC_BOARD;
  validateBoard(board);
  return {
    phase: 'AWAITING_ROLL',
    board,
    ruleSet: { ...CLASSIC_RULES, ...config.ruleSet },
    players: config.playerNames.map((name, id) => ({ id, name, cell: 0 })),
    current: 0,
    sixChain: 0,
    turn: EMPTY_TURN,
    winner: null,
    seed: config.seed,
    rng: seedRng(config.seed),
    script: config.rollScript ?? null,
    scriptIndex: 0,
    turnNumber: 1,
    log: [{ type: 'GAME_STARTED', seed: config.seed, playerNames: [...config.playerNames] }],
  };
}

/** Draw the next die value — from the roll script when present, else the seeded PRNG. */
function drawDie(state: GameState): { value: number; rng: number; scriptIndex: number } {
  if (state.script !== null && state.scriptIndex < state.script.length) {
    const value = must(state.script[state.scriptIndex]);
    return { value, rng: state.rng, scriptIndex: state.scriptIndex + 1 };
  }
  const [value, rng] = rollDie(state.rng);
  return { value, rng, scriptIndex: state.scriptIndex };
}

/** AWAITING_ROLL → DICE_ROLLING. The outcome is decided HERE; physics is theater. */
export function startRoll(state: GameState): GameState {
  if (!guard(state, 'AWAITING_ROLL', 'startRoll')) return state;
  const { value, rng, scriptIndex } = drawDie(state);
  return withEvents(
    {
      ...state,
      phase: 'DICE_ROLLING',
      rng,
      scriptIndex,
      turn: { ...EMPTY_TURN, die: value },
    },
    [{ type: 'ROLLED', player: state.current, value }],
  );
}

/** DICE_ROLLING → TOKEN_MOVING. Resolves the path (or an empty one on six-forfeit). */
export function diceSettled(state: GameState): GameState {
  if (!guard(state, 'DICE_ROLLING', 'diceSettled')) return state;
  const die = must(state.turn.die, 'diceSettled with no die value');
  const events: GameEvent[] = [];

  const isThirdSix =
    state.ruleSet.rollSixAgain && die === 6 && state.sixChain >= state.ruleSet.maxConsecutiveSixes - 1;
  if (isThirdSix) {
    events.push({ type: 'SIX_FORFEIT', player: state.current });
    return withEvents(
      {
        ...state,
        phase: 'TOKEN_MOVING',
        turn: { ...state.turn, path: [], landed: currentPlayer(state).cell, bounced: false, forfeited: true },
      },
      events,
    );
  }

  const move = computeMove(currentPlayer(state).cell, die, state.ruleSet);
  return withEvents(
    {
      ...state,
      phase: 'TOKEN_MOVING',
      turn: { ...state.turn, path: move.path, landed: move.landed, bounced: move.bounced },
    },
    events,
  );
}

/** Capture: opponents on `cell` go back to start (rule-gated). */
function applyCapture(state: GameState, cell: number): { players: readonly PlayerState[]; events: GameEvent[] } {
  if (!state.ruleSet.captureEnabled || cell === 0 || cell === LAST_CELL) {
    return { players: state.players, events: [] };
  }
  const events: GameEvent[] = [];
  const players = state.players.map((p) => {
    if (p.id !== state.current && p.cell === cell) {
      events.push({ type: 'CAPTURED', player: state.current, victim: p.id, cell });
      return { ...p, cell: 0 };
    }
    return p;
  });
  return { players, events };
}

/** TOKEN_MOVING → RESOLVING_JUMP | CHECK_WIN. Commits the landing cell. */
export function tokenArrived(state: GameState): GameState {
  if (!guard(state, 'TOKEN_MOVING', 'tokenArrived')) return state;
  const landed = must(state.turn.landed, 'tokenArrived with no landing cell');
  const events: GameEvent[] = [];
  const from = currentPlayer(state).cell;

  let players: readonly PlayerState[] = state.players.map((p) =>
    p.id === state.current ? { ...p, cell: landed } : p,
  );
  if (state.turn.path.length > 0) {
    events.push({
      type: 'MOVED',
      player: state.current,
      from,
      to: landed,
      path: state.turn.path,
      bounced: state.turn.bounced,
    });
  }

  // Jumps fire on ARRIVAL only — a token that didn't move (forfeit, or overshoot
  // with bounce disabled) never re-triggers the jump on the cell it sits on.
  const jump = state.turn.path.length === 0 ? null : findJump(state.board, landed);
  if (jump !== null) {
    return withEvents({ ...state, players, phase: 'RESOLVING_JUMP', turn: { ...state.turn, jump } }, events);
  }

  const capture = applyCapture({ ...state, players }, landed);
  players = capture.players;
  events.push(...capture.events);
  return withEvents({ ...state, players, phase: 'CHECK_WIN' }, events);
}

/** RESOLVING_JUMP → CHECK_WIN. Applies the snake/ladder displacement. */
export function jumpResolved(state: GameState): GameState {
  if (!guard(state, 'RESOLVING_JUMP', 'jumpResolved')) return state;
  const jump = must(state.turn.jump, 'jumpResolved with no jump');
  const events: GameEvent[] = [
    { type: 'JUMPED', player: state.current, kind: jump.kind, from: jump.from, to: jump.to },
  ];

  let players: readonly PlayerState[] = state.players.map((p) =>
    p.id === state.current ? { ...p, cell: jump.to } : p,
  );
  const capture = applyCapture({ ...state, players }, jump.to);
  players = capture.players;
  events.push(...capture.events);
  return withEvents({ ...state, players, phase: 'CHECK_WIN' }, events);
}

/** CHECK_WIN → WIN | NEXT_TURN. */
export function checkWin(state: GameState): GameState {
  if (!guard(state, 'CHECK_WIN', 'checkWin')) return state;
  if (currentPlayer(state).cell === LAST_CELL) {
    return withEvents({ ...state, phase: 'WIN', winner: state.current }, [
      { type: 'WON', player: state.current },
    ]);
  }
  return { ...state, phase: 'NEXT_TURN' };
}

/** NEXT_TURN → AWAITING_ROLL. Six-again chains (capped) or pass to the next player. */
export function nextTurn(state: GameState): GameState {
  if (!guard(state, 'NEXT_TURN', 'nextTurn')) return state;
  const events: GameEvent[] = [];
  const rolledSix = state.turn.die === 6;
  const goesAgain = state.ruleSet.rollSixAgain && rolledSix && !state.turn.forfeited;

  let current = state.current;
  let sixChain: number;
  if (goesAgain) {
    sixChain = state.sixChain + 1;
    events.push({ type: 'EXTRA_TURN', player: current });
  } else {
    current = (state.current + 1) % state.players.length;
    sixChain = 0;
    events.push({ type: 'TURN_PASSED', player: state.current, next: current });
  }

  return withEvents(
    {
      ...state,
      phase: 'AWAITING_ROLL',
      current,
      sixChain,
      turn: EMPTY_TURN,
      turnNumber: state.turnNumber + 1,
    },
    events,
  );
}
