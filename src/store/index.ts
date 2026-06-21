import { create } from 'zustand';
import {
  checkWin,
  createGame,
  diceSettled,
  jumpResolved,
  nextTurn,
  setStrictMode,
  startRoll,
  tokenArrived,
  TRADITIONAL_BOARD,
  type GameState,
  type RuleSet,
} from '../core';
import type { ThemeId } from '../engine/theme/themes';

// Strict FSM (throw on illegal transition) in dev; console.error no-op in prod.
setStrictMode(import.meta.env.DEV);

export type QualityTier = 'high' | 'medium' | 'low';
export type QualitySetting = QualityTier | 'auto';
export type BoardStyle = 'solid' | 'wood';
export type Gender = 'male' | 'female';

/** Color palettes chosen in Setup / Settings. Index 0 of board/table is the default. */
export const BOARD_PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['#efe3c6', '#c9a06a'], // heritage cream / tan (default)
  ['#e8d8b0', '#8a5a3c'], // maple / walnut
  ['#dfe7ef', '#5b7a99'], // ivory / slate blue
  ['#e9dccb', '#3f7d5a'], // ivory / forest
  ['#f0d9c0', '#a23e3e'], // ivory / rosewood
  ['#efe0f0', '#7d4fae'], // lilac / violet
  ['#fbe9c8', '#d98324'], // cream / amber
  ['#d9f0ec', '#2f8f83'], // mint / teal
  ['#fde2e2', '#c0405a'], // blush / cherry
  ['#2b3049', '#1b1f33'], // mystic dark
];
export const TABLE_PALETTE: readonly string[] = [
  '#3a2418', // warm walnut (default)
  '#6b3f1d', // chestnut
  '#1c1c22', // slate
  '#143018', // billiard green
  '#0e2a3a', // deep teal
  '#3a1020', // wine
  '#2e1a2e', // plum
  '#0e1020', // midnight
];
/** Vivid, well-separated token colors (Setup assigns these to players in order). */
export const TOKEN_PALETTE: readonly string[] = [
  '#e6432e', // red
  '#2f7fe0', // blue
  '#27a25a', // green
  '#e8a417', // amber
  '#9b4fd4', // violet
  '#19b6c0', // teal
  '#ec5fa0', // pink
  '#7a8a3a', // olive
];

const DEFAULT_TABLE_COLOR = '#3a2418';
const DEFAULT_BOARD_COLORS: [string, string] = ['#efe3c6', '#c9a06a'];
/**
 * Real games: exact roll required AND no bounce → 96 + 5 can't move (stays put);
 * a token must roll exactly 1 to leave the start.
 */
const DEFAULT_RULES: Partial<RuleSet> = {
  exactRollToWin: true,
  bounceOnOvershoot: false,
  requireEntryRoll: true,
};

export interface NewGameConfig {
  names: string[];
  seed: number;
  rules?: Partial<RuleSet>;
  rollScript?: number[];
}

interface PersistedSettings {
  theme: ThemeId;
  quality: QualitySetting;
  soundOn: boolean;
  /** Concrete hex; click the table to cycle it (TABLE_PALETTE). */
  tableColor: string;
  /** Light/dark tile pair; click the board to cycle it (BOARD_PALETTE). */
  boardColors: [string, string];
  boardStyle: BoardStyle;
}

const SETTINGS_KEY = 'serpents-ascent:settings:v1';

function loadSettings(): PersistedSettings {
  const fallback: PersistedSettings = {
    theme: 'walnut',
    quality: 'auto',
    soundOn: true,
    tableColor: DEFAULT_TABLE_COLOR,
    boardColors: DEFAULT_BOARD_COLORS,
    boardStyle: 'solid',
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return fallback;
    const merged = { ...fallback, ...(JSON.parse(raw) as Partial<PersistedSettings>) };
    // Migrate older saves: '' used to mean "follow theme"; give it a concrete default.
    if (!merged.tableColor) merged.tableColor = DEFAULT_TABLE_COLOR;
    if (!Array.isArray(merged.boardColors) || merged.boardColors.length !== 2) {
      merged.boardColors = DEFAULT_BOARD_COLORS;
    }
    return merged;
  } catch {
    return fallback;
  }
}

function saveSettings(s: PersistedSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable (private mode etc.) — settings just won't persist
  }
}

export interface AppStore {
  // --- game slice ---
  game: GameState;
  /** False until the player finishes the Setup screen and starts a match. */
  started: boolean;
  /** Per-player presentation (NOT in core — index-aligned with game.players). */
  playerGenders: Gender[];
  playerColors: string[];
  /** Engine animations complete immediately (scripted verification, replays). */
  instantMode: boolean;
  /** Monotonic counters; bumping one triggers the matching one-shot effect. */
  vignettePulseId: number;
  roll: () => void;
  onDiceSettled: () => void;
  onTokenArrived: () => void;
  onJumpResolved: () => void;
  newGame: (cfg: NewGameConfig) => void;
  /** Begin a configured match from the Setup screen. */
  startGame: (cfg: { names: string[]; genders: Gender[]; colors: string[]; seed?: number }) => void;
  /** Return to the Setup screen (e.g. after a win). */
  backToSetup: () => void;
  setInstantMode: (on: boolean) => void;
  pulseVignette: () => void;

  // --- camera slice ---
  introDone: boolean;
  finishIntro: () => void;
  resetViewId: number;
  requestResetView: () => void;

  // --- settings slice ---
  theme: ThemeId;
  quality: QualitySetting;
  /** What the renderer actually uses ('auto' resolves here via FPS sampling). */
  resolvedTier: QualityTier;
  soundOn: boolean;
  hidden: boolean;
  /** Presentation customization (DECISIONS: data-driven materials). */
  tableColor: string;
  boardColors: [string, string];
  boardStyle: BoardStyle;
  setTheme: (t: ThemeId) => void;
  setQuality: (q: QualitySetting) => void;
  setResolvedTier: (t: QualityTier) => void;
  setSoundOn: (on: boolean) => void;
  setHidden: (h: boolean) => void;
  setTableColor: (c: string) => void;
  setBoardColors: (c: [string, string]) => void;
  setBoardStyle: (b: BoardStyle) => void;
}

/** CHECK_WIN and NEXT_TURN are decision phases with no animation dwell — resolve inline. */
function finishTurn(game: GameState): GameState {
  let g = checkWin(game);
  if (g.phase === 'NEXT_TURN') g = nextTurn(g);
  return g;
}

const initialSettings = loadSettings();

export const useStore = create<AppStore>()((set, get) => ({
  game: createGame({
    playerNames: ['Player 1', 'Player 2'],
    seed: Math.floor(Math.random() * 0x7fffffff),
    board: TRADITIONAL_BOARD,
  }),
  started: false,
  playerGenders: ['male', 'female'],
  playerColors: ['#e6432e', '#2f7fe0'], // TOKEN_PALETTE[0], [1]
  instantMode: false,
  vignettePulseId: 0,

  roll: () => {
    const { game } = get();
    if (game.phase !== 'AWAITING_ROLL') return; // input only accepted while awaiting
    set({ game: startRoll(game) });
  },
  onDiceSettled: () => {
    set({ game: diceSettled(get().game) });
  },
  onTokenArrived: () => {
    let g = tokenArrived(get().game);
    if (g.phase === 'CHECK_WIN') g = finishTurn(g);
    set({ game: g });
  },
  onJumpResolved: () => {
    let g = jumpResolved(get().game);
    if (g.phase === 'CHECK_WIN') g = finishTurn(g);
    set({ game: g });
  },
  newGame: (cfg) => {
    set({
      game: createGame({
        playerNames: cfg.names,
        seed: cfg.seed,
        ruleSet: cfg.rules,
        rollScript: cfg.rollScript,
      }),
    });
  },
  startGame: (cfg) => {
    set({
      game: createGame({
        playerNames: cfg.names,
        seed: cfg.seed ?? Math.floor(Math.random() * 0x7fffffff),
        board: TRADITIONAL_BOARD,
        ruleSet: DEFAULT_RULES, // 96 + 5 stays put; need a 1 to enter
      }),
      playerGenders: cfg.genders,
      playerColors: cfg.colors,
      started: true,
    });
  },
  backToSetup: () => set({ started: false }),
  setInstantMode: (on) => set({ instantMode: on }),
  pulseVignette: () => set((s) => ({ vignettePulseId: s.vignettePulseId + 1 })),

  introDone: false,
  finishIntro: () => set({ introDone: true }),
  resetViewId: 0,
  requestResetView: () => set((s) => ({ resetViewId: s.resetViewId + 1 })),

  theme: initialSettings.theme,
  quality: initialSettings.quality,
  resolvedTier: initialSettings.quality === 'auto' ? 'high' : initialSettings.quality,
  soundOn: initialSettings.soundOn,
  hidden: false,
  tableColor: initialSettings.tableColor,
  boardColors: initialSettings.boardColors,
  boardStyle: initialSettings.boardStyle,
  setTheme: (theme) => {
    set({ theme });
    persist();
  },
  setQuality: (quality) => {
    set({ quality, resolvedTier: quality === 'auto' ? 'high' : quality });
    persist();
  },
  setResolvedTier: (resolvedTier) => set({ resolvedTier }),
  setSoundOn: (soundOn) => {
    set({ soundOn });
    persist();
  },
  setHidden: (hidden) => set({ hidden }),
  setTableColor: (tableColor) => {
    set({ tableColor });
    persist();
  },
  setBoardColors: (boardColors) => {
    set({ boardColors });
    persist();
  },
  setBoardStyle: (boardStyle) => {
    set({ boardStyle });
    persist();
  },
}));

/** Snapshot the persisted settings from live state and write them. */
function persist(): void {
  const { theme, quality, soundOn, tableColor, boardColors, boardStyle } = useStore.getState();
  saveSettings({ theme, quality, soundOn, tableColor, boardColors, boardStyle });
}
