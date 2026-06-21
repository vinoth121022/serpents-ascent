import { describe, expect, it } from 'vitest';
import { nextFloat, nextU32, rollDie, seedRng } from '../rng/prng';

function sequence(seed: number, n: number): number[] {
  let state = seedRng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const [v, s] = rollDie(state);
    out.push(v);
    state = s;
  }
  return out;
}

describe('mulberry32 PRNG', () => {
  it('produces identical roll sequences for identical seeds', () => {
    expect(sequence(42, 100)).toEqual(sequence(42, 100));
    expect(sequence(7, 50)).toEqual(sequence(7, 50));
  });

  it('produces different sequences for different seeds', () => {
    expect(sequence(1, 50)).not.toEqual(sequence(2, 50));
  });

  it('normalizes seeds to uint32', () => {
    expect(seedRng(4294967296)).toBe(0);
    expect(seedRng(-1)).toBe(4294967295);
  });

  it('nextU32 returns a uint32 and advances state', () => {
    const s0 = seedRng(123);
    const [v, s1] = nextU32(s0);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(v)).toBe(true);
    expect(s1).not.toBe(s0);
  });

  it('nextFloat stays in [0, 1)', () => {
    let state = seedRng(99);
    for (let i = 0; i < 1000; i++) {
      const [f, s] = nextFloat(state);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      state = s;
    }
  });

  it('rolls uniformly across 60k draws (χ² sanity, df=5)', () => {
    const N = 60000;
    const bins = [0, 0, 0, 0, 0, 0];
    let state = seedRng(1337);
    for (let i = 0; i < N; i++) {
      const [v, s] = rollDie(state);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      bins[v - 1] = (bins[v - 1] ?? 0) + 1;
      state = s;
    }
    const expected = N / 6;
    const chi2 = bins.reduce((acc, obs) => acc + ((obs - expected) * (obs - expected)) / expected, 0);
    // df=5: χ² < 25 is far beyond the p=0.999 tail — eyeball threshold per spec §7.
    expect(chi2).toBeLessThan(25);
    expect(bins.every((b) => b > 0)).toBe(true);
  });
});
