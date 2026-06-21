import { describe, expect, it } from 'vitest';
import {
  arcBetween,
  DIE_FACES,
  faceUp,
  IDENTITY_QUAT,
  orientationShowing,
  quatFromAxisAngle,
  quatMultiply,
  quatNormalize,
  rotateVec,
  type Quat,
  type Vec3,
} from '../rules/dice';

/** All 24 orientations of the cube rotation group: 6 faces up × 4 yaw spins. */
function all24(): { quat: Quat; expected: number }[] {
  const out: { quat: Quat; expected: number }[] = [];
  for (const face of DIE_FACES) {
    const base = arcBetween(face.normal, [0, 1, 0]);
    for (let k = 0; k < 4; k++) {
      const spin = quatFromAxisAngle([0, 1, 0], (k * Math.PI) / 2);
      out.push({ quat: quatNormalize(quatMultiply(spin, base)), expected: face.value });
    }
  }
  return out;
}

describe('die face convention', () => {
  it('uses a standard die: opposite faces sum to 7', () => {
    for (const face of DIE_FACES) {
      const opposite = DIE_FACES.find(
        (f) => f.normal[0] === -face.normal[0] && f.normal[1] === -face.normal[1] && f.normal[2] === -face.normal[2],
      );
      expect(opposite).toBeDefined();
      expect(face.value + (opposite?.value ?? 0)).toBe(7);
    }
  });
});

describe('faceUp', () => {
  it('reads identity orientation as 1 (the +Y face)', () => {
    expect(faceUp(IDENTITY_QUAT)).toBe(1);
  });

  it('correctly maps all 24 cube orientations', () => {
    const cases = all24();
    expect(cases).toHaveLength(24);
    for (const { quat, expected } of cases) {
      expect(faceUp(quat)).toBe(expected);
    }
  });
});

describe('quaternion helpers', () => {
  it('rotateVec matches known 90° rotations', () => {
    const z90 = quatFromAxisAngle([0, 0, 1], Math.PI / 2);
    const [x, y, z] = rotateVec(z90, [1, 0, 0]);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1);
    expect(z).toBeCloseTo(0);
  });

  it('arcBetween rotates u onto v (generic case)', () => {
    const q = arcBetween([1, 0, 0], [0, 0, 1]);
    const [x, y, z] = rotateVec(q, [1, 0, 0]);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(1);
  });

  it('arcBetween handles antiparallel vectors (both perpendicular-axis branches)', () => {
    const flips: [Vec3, Vec3][] = [
      [[0, 1, 0], [0, -1, 0]], // |u.x| < 0.9 → perp (1,0,0)
      [[1, 0, 0], [-1, 0, 0]], // |u.x| ≥ 0.9 → perp (0,1,0)
    ];
    for (const [u, v] of flips) {
      const q = arcBetween(u, v);
      const w = rotateVec(q, u);
      expect(w[0]).toBeCloseTo(v[0]);
      expect(w[1]).toBeCloseTo(v[1]);
      expect(w[2]).toBeCloseTo(v[2]);
    }
  });
});

describe('orientationShowing (reconciliation)', () => {
  it('brings every requested face up from every one of the 24 orientations', () => {
    for (const { quat } of all24()) {
      for (let value = 1; value <= 6; value++) {
        expect(faceUp(orientationShowing(value, quat))).toBe(value);
      }
    }
  });

  it('is a no-op rotation when the face is already up', () => {
    const corrected = orientationShowing(1, IDENTITY_QUAT);
    const [, y] = rotateVec(corrected, [0, 1, 0]);
    expect(y).toBeCloseTo(1);
  });

  it('rejects impossible face values', () => {
    expect(() => orientationShowing(7, IDENTITY_QUAT)).toThrow('no die face 7');
  });
});
