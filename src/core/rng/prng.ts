/**
 * mulberry32 — tiny, fast, well-distributed 32-bit seeded PRNG.
 * Implemented as pure functions over an explicit uint32 state so the RNG
 * lives inside GameState: serializable, replayable, server-runnable.
 */

export type RngState = number; // uint32

export function seedRng(seed: number): RngState {
  return seed >>> 0;
}

/** One mulberry32 step. Returns [uint32 output, next state]. */
export function nextU32(state: RngState): [number, RngState] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const out = (t ^ (t >>> 14)) >>> 0;
  return [out, next];
}

/** Uniform float in [0, 1). */
export function nextFloat(state: RngState): [number, RngState] {
  const [u, s] = nextU32(state);
  return [u / 4294967296, s];
}

/** Fair die: integer in 1..6. */
export function rollDie(state: RngState): [number, RngState] {
  const [f, s] = nextFloat(state);
  return [1 + Math.floor(f * 6), s];
}
