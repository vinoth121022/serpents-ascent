/**
 * Dice face math — pure quaternion helpers shared by engine pip placement,
 * face detection, and outcome reconciliation. Convention (DECISIONS.md #4):
 * +Y=1, −Y=6, +X=3, −X=4, +Z=2, −Z=5 (opposite faces sum to 7).
 */

import { must } from '../util';

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type Vec3 = readonly [number, number, number];

export interface DieFace {
  value: number;
  normal: Vec3; // local-space face normal
}

export const DIE_FACES: readonly DieFace[] = [
  { value: 1, normal: [0, 1, 0] },
  { value: 6, normal: [0, -1, 0] },
  { value: 3, normal: [1, 0, 0] },
  { value: 4, normal: [-1, 0, 0] },
  { value: 2, normal: [0, 0, 1] },
  { value: 5, normal: [0, 0, -1] },
];

export const IDENTITY_QUAT: Quat = { x: 0, y: 0, z: 0, w: 1 };

export function quatMultiply(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const half = angle / 2;
  const s = Math.sin(half);
  return { x: axis[0] * s, y: axis[1] * s, z: axis[2] * s, w: Math.cos(half) };
}

export function quatNormalize(q: Quat): Quat {
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

/** Rotate a vector by a quaternion (q v q⁻¹, expanded). */
export function rotateVec(q: Quat, v: Vec3): [number, number, number] {
  const { x, y, z, w } = q;
  const [vx, vy, vz] = v;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  // v' = v + w*t + cross(q.xyz, t)
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

/** Which face value points most upward (+Y world) for a die at orientation q. */
export function faceUp(q: Quat): number {
  let best = DIE_FACES[0] as DieFace;
  let bestDot = -Infinity;
  for (const face of DIE_FACES) {
    const [, wy] = rotateVec(q, face.normal);
    if (wy > bestDot) {
      bestDot = wy;
      best = face;
    }
  }
  return best.value;
}

/** Shortest-arc rotation taking unit vector u onto unit vector v. */
export function arcBetween(u: Vec3, v: Vec3): Quat {
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  if (dot < -0.999999) {
    // Antiparallel: 180° about any axis perpendicular to u.
    const perp: Vec3 = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const axis: Vec3 = [
      u[1] * perp[2] - u[2] * perp[1],
      u[2] * perp[0] - u[0] * perp[2],
      u[0] * perp[1] - u[1] * perp[0],
    ];
    const len = Math.hypot(axis[0], axis[1], axis[2]);
    return quatFromAxisAngle([axis[0] / len, axis[1] / len, axis[2] / len], Math.PI);
  }
  const cx = u[1] * v[2] - u[2] * v[1];
  const cy = u[2] * v[0] - u[0] * v[2];
  const cz = u[0] * v[1] - u[1] * v[0];
  return quatNormalize({ x: cx, y: cy, z: cz, w: 1 + dot });
}

/**
 * Reconciliation: the world-space rotation that brings `value`'s face up for a die
 * currently at orientation q. Returns the corrected full orientation (apply directly,
 * or slerp from q to it). Used after the physics die settles on the "wrong" face.
 */
export function orientationShowing(value: number, q: Quat): Quat {
  const face = must(DIE_FACES.find((f) => f.value === value), `no die face ${value}`);
  const worldNormal = rotateVec(q, face.normal);
  const len = Math.hypot(worldNormal[0], worldNormal[1], worldNormal[2]);
  const unit: Vec3 = [worldNormal[0] / len, worldNormal[1] / len, worldNormal[2] / len];
  const correction = arcBetween(unit, [0, 1, 0]);
  return quatNormalize(quatMultiply(correction, q));
}
