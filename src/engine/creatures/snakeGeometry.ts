import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, Vector3 } from 'three';
import { cellToWorld, nextFloat, seedRng } from '../../core';

/**
 * Snake body spline: head cell → tail cell with lateral S-curve midpoints and a
 * y-arch so the body drapes over the board. Deterministic per (from,to) via the
 * core PRNG, and clamped inside the frame walls (|x|,|z| ≤ 4.7).
 */
export function buildSnakeCurve(from: number, to: number): CatmullRomCurve3 {
  const a = cellToWorld(from);
  const b = cellToWorld(to);
  let rng = seedRng(from * 1000 + to);
  const rand = (): number => {
    const [v, s] = nextFloat(rng);
    rng = s;
    return v;
  };

  const ax = a.x, az = a.z, bx = b.x, bz = b.z;
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  // Unit perpendicular in the board plane.
  const px = -dz / len, pz = dx / len;

  const mids = 2 + (len > 5 ? 1 : 0);
  const clamp = (v: number): number => Math.max(-4.7, Math.min(4.7, v));

  const points: Vector3[] = [];
  points.push(new Vector3(ax, 0.16, az)); // head rests on its cell
  for (let i = 1; i <= mids; i++) {
    const t = i / (mids + 1);
    const side = (i % 2 === 0 ? 1 : -1) * (0.45 + rand() * 0.5);
    const arch = 0.14 + Math.sin(t * Math.PI) * (0.1 + rand() * 0.12);
    points.push(new Vector3(clamp(ax + dx * t + px * side), arch, clamp(az + dz * t + pz * side)));
  }
  points.push(new Vector3(bx, 0.05, bz)); // tail tapers onto its cell

  return new CatmullRomCurve3(points, false, 'centripetal');
}

/**
 * Tube with a tapering radius (head 0.11 → tail 0.03, pinching to a point) —
 * TubeGeometry is constant-radius, so rings are built by hand from Frenet frames.
 * Vertex colors carry the per-snake hue so ALL snake bodies merge into one draw call.
 */
export function buildTaperedTube(
  curve: CatmullRomCurve3,
  color: Color,
  segments = 72,
  radialSegments = 10,
  rHead = 0.11,
  rTail = 0.03,
): BufferGeometry {
  const frames = curve.computeFrenetFrames(segments, false);
  const vertexCount = (segments + 1) * (radialSegments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices: number[] = [];

  let vi = 0;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    // Linear taper with a pinch to a point over the last 8% for a clean tail tip.
    const pinch = t > 0.92 ? Math.max(0.04, (1 - t) / 0.08) : 1;
    const radius = (rHead + (rTail - rHead) * t) * pinch;
    const N = frames.normals[i] as Vector3;
    const B = frames.binormals[i] as Vector3;
    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      const nx = cos * N.x + sin * B.x;
      const ny = cos * N.y + sin * B.y;
      const nz = cos * N.z + sin * B.z;
      positions[vi * 3] = p.x + nx * radius;
      positions[vi * 3 + 1] = p.y + ny * radius;
      positions[vi * 3 + 2] = p.z + nz * radius;
      normals[vi * 3] = nx;
      normals[vi * 3 + 1] = ny;
      normals[vi * 3 + 2] = nz;
      // Snakeskin: darker dorsal (top) fading to a pale belly, plus periodic
      // cross-bands along the length — reads as scaly patterning, not a toy tube.
      const dorsal = ny >= 0 ? 1 - ny * 0.42 : 1 - ny * 0.2; // top → 0.58, belly → 1.2
      const band = 0.82 + 0.18 * Math.sin(t * Math.PI * 2 * 11);
      const shade = dorsal * band;
      colors[vi * 3] = color.r * shade;
      colors[vi * 3 + 1] = color.g * shade;
      colors[vi * 3 + 2] = color.b * shade;
      vi += 1;
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * (radialSegments + 1) + j;
      const b = a + radialSegments + 1;
      // CCW from outside — keeps faces front-facing and normals usable as-is.
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('normal', new BufferAttribute(normals, 3));
  g.setAttribute('color', new BufferAttribute(colors, 3));
  g.setIndex(indices);
  return g;
}
