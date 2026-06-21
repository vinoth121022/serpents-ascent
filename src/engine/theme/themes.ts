export type ThemeId = 'walnut' | 'mystic';

export interface MaterialSpec {
  color: string;
  roughness: number;
  metalness: number;
  emissive?: string;
  emissiveIntensity?: number;
}

export interface Theme {
  id: ThemeId;
  label: string;
  background: string;
  /** Alternating tile instance colors. */
  tileA: string;
  tileB: string;
  tileRoughness: number;
  tileMetalness: number;
  numberInk: string;
  startTint: string;
  finishTint: string;
  frame: MaterialSpec;
  inlay: MaterialSpec;
  table: MaterialSpec;
  ladderWood: MaterialSpec;
  snakeColors: readonly string[];
  snakeEmissiveIntensity: number;
  tokenColors: readonly [string, string, string, string];
  die: MaterialSpec;
  pip: string;
  tray: MaterialSpec;
  keyLight: string;
  fillSky: string;
  fillGround: string;
}

/** Heritage Walnut — polished wood, brass inlay, ivory-tone tiles. */
export const WALNUT: Theme = {
  id: 'walnut',
  label: 'Heritage Walnut',
  background: '#191209',
  tileA: '#efe3c6',
  tileB: '#c9a06a',
  tileRoughness: 0.38,
  tileMetalness: 0.06,
  numberInk: '#52351b',
  startTint: '#9ec98a',
  finishTint: '#e7bf56',
  frame: { color: '#5e3d1d', roughness: 0.42, metalness: 0.08 },
  inlay: { color: '#c9a227', roughness: 0.25, metalness: 0.9 },
  table: { color: '#2a1f15', roughness: 0.9, metalness: 0.0 },
  ladderWood: { color: '#a8743a', roughness: 0.55, metalness: 0.05 },
  snakeColors: ['#2e7d4f', '#7c3aae', '#b03a2e', '#1f7a8c', '#a85f00', '#31407a', '#6d8f2f', '#8c2f5d', '#3e6b5a'],
  snakeEmissiveIntensity: 0.35,
  tokenColors: ['#b3382c', '#2456a8', '#1e8449', '#d68910'],
  die: { color: '#f3ecdb', roughness: 0.32, metalness: 0.02 },
  pip: '#2c2118',
  tray: { color: '#4a3018', roughness: 0.5, metalness: 0.08 },
  keyLight: '#fff4e0',
  fillSky: '#dfe8ff',
  fillGround: '#3a2c1c',
};

/** Mystic Realm — dark stone, gold trim, emissive rune accents, glowing serpents. */
export const MYSTIC: Theme = {
  id: 'mystic',
  label: 'Mystic Realm',
  background: '#080a14',
  tileA: '#2b3049',
  tileB: '#1b1f33',
  tileRoughness: 0.52,
  tileMetalness: 0.12,
  numberInk: '#a8d4ff',
  startTint: '#3fae7a',
  finishTint: '#e7bf56',
  frame: { color: '#1d2236', roughness: 0.48, metalness: 0.15 },
  inlay: { color: '#ffd75e', roughness: 0.3, metalness: 0.7, emissive: '#ffb13d', emissiveIntensity: 0.85 },
  table: { color: '#0e1020', roughness: 0.85, metalness: 0.0 },
  ladderWood: { color: '#7d6134', roughness: 0.5, metalness: 0.2 },
  snakeColors: ['#3ed3a3', '#c44fd4', '#ff5470', '#39c2ff', '#ffc24f', '#7e6bff', '#5be35b', '#ff8a3d', '#4fd0c0'],
  snakeEmissiveIntensity: 0.5,
  tokenColors: ['#39c2ff', '#ff5fa2', '#a6ff4d', '#ffc857'],
  die: { color: '#ece6f5', roughness: 0.3, metalness: 0.05 },
  pip: '#1c1530',
  tray: { color: '#181c30', roughness: 0.45, metalness: 0.2 },
  keyLight: '#e8e4ff',
  fillSky: '#9db4ff',
  fillGround: '#141026',
};

export const THEMES: Record<ThemeId, Theme> = { walnut: WALNUT, mystic: MYSTIC };
