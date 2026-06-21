import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  PointLight,
  Quaternion,
  Vector3,
} from 'three';
import { registry, type FxApi } from '../registry';
import type { Theme } from '../theme/themes';

/**
 * One pooled instanced particle system per blend mode — zero allocation in the
 * frame loop (spec §9). 'chunk' = lit confetti rectangles; 'glow' = additive
 * sparkles / dust motes / puffs.
 */
const CHUNK_CAP = 420;
const GLOW_CAP = 280;
const MOTE_TARGET = 48;

interface Pool {
  cap: number;
  alive: number;
  // SoA state, preallocated
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  rx: Float32Array;
  ry: Float32Array;
  rz: Float32Array;
  wx: Float32Array;
  wy: Float32Array;
  wz: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  size: Float32Array;
  gravity: Float32Array;
  drag: Float32Array;
  color: Float32Array; // rgb triplets
}

function makePool(cap: number): Pool {
  return {
    cap,
    alive: 0,
    px: new Float32Array(cap),
    py: new Float32Array(cap),
    pz: new Float32Array(cap),
    vx: new Float32Array(cap),
    vy: new Float32Array(cap),
    vz: new Float32Array(cap),
    rx: new Float32Array(cap),
    ry: new Float32Array(cap),
    rz: new Float32Array(cap),
    wx: new Float32Array(cap),
    wy: new Float32Array(cap),
    wz: new Float32Array(cap),
    life: new Float32Array(cap),
    maxLife: new Float32Array(cap),
    size: new Float32Array(cap),
    gravity: new Float32Array(cap),
    drag: new Float32Array(cap),
    color: new Float32Array(cap * 3),
  };
}

interface SpawnOpts {
  position: Vector3;
  spread: number;
  velocity: [number, number, number];
  velocityJitter: number;
  life: [number, number];
  size: [number, number];
  gravity: number;
  drag: number;
  colors: readonly Color[];
  spin?: number;
}

function spawn(pool: Pool, count: number, opts: SpawnOpts): void {
  for (let k = 0; k < count; k++) {
    if (pool.alive >= pool.cap) return; // pool exhausted: drop, never allocate
    const i = pool.alive;
    pool.alive += 1;
    const jitter = opts.velocityJitter;
    pool.px[i] = opts.position.x + (Math.random() - 0.5) * opts.spread;
    pool.py[i] = opts.position.y + (Math.random() - 0.5) * opts.spread;
    pool.pz[i] = opts.position.z + (Math.random() - 0.5) * opts.spread;
    pool.vx[i] = opts.velocity[0] + (Math.random() - 0.5) * jitter;
    pool.vy[i] = opts.velocity[1] + (Math.random() - 0.5) * jitter;
    pool.vz[i] = opts.velocity[2] + (Math.random() - 0.5) * jitter;
    pool.rx[i] = Math.random() * Math.PI * 2;
    pool.ry[i] = Math.random() * Math.PI * 2;
    pool.rz[i] = Math.random() * Math.PI * 2;
    const spin = opts.spin ?? 0;
    pool.wx[i] = (Math.random() - 0.5) * spin;
    pool.wy[i] = (Math.random() - 0.5) * spin;
    pool.wz[i] = (Math.random() - 0.5) * spin;
    const life = opts.life[0] + Math.random() * (opts.life[1] - opts.life[0]);
    pool.life[i] = life;
    pool.maxLife[i] = life;
    pool.size[i] = opts.size[0] + Math.random() * (opts.size[1] - opts.size[0]);
    pool.gravity[i] = opts.gravity;
    pool.drag[i] = opts.drag;
    const c = opts.colors[Math.floor(Math.random() * opts.colors.length)] ?? WHITE;
    pool.color[i * 3] = c.r;
    pool.color[i * 3 + 1] = c.g;
    pool.color[i * 3 + 2] = c.b;
  }
}

const WHITE = new Color('#ffffff');
const tmpC = new Color();
const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpP = new Vector3();
const tmpS = new Vector3();
const tmpE = new Euler();

function step(pool: Pool, mesh: InstancedMesh, dt: number): void {
  let i = 0;
  while (i < pool.alive) {
    pool.life[i] = (pool.life[i] ?? 0) - dt;
    if ((pool.life[i] ?? 0) <= 0) {
      // swap-remove with the last alive particle
      const last = pool.alive - 1;
      for (const key of ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'rx', 'ry', 'rz', 'wx', 'wy', 'wz', 'life', 'maxLife', 'size', 'gravity', 'drag'] as const) {
        pool[key][i] = pool[key][last] ?? 0;
      }
      pool.color[i * 3] = pool.color[last * 3] ?? 1;
      pool.color[i * 3 + 1] = pool.color[last * 3 + 1] ?? 1;
      pool.color[i * 3 + 2] = pool.color[last * 3 + 2] ?? 1;
      pool.alive = last;
      continue;
    }
    const drag = Math.pow(pool.drag[i] ?? 1, dt * 60);
    pool.vx[i] = (pool.vx[i] ?? 0) * drag;
    pool.vy[i] = ((pool.vy[i] ?? 0) - (pool.gravity[i] ?? 0) * dt) * drag;
    pool.vz[i] = (pool.vz[i] ?? 0) * drag;
    pool.px[i] = (pool.px[i] ?? 0) + (pool.vx[i] ?? 0) * dt;
    pool.py[i] = (pool.py[i] ?? 0) + (pool.vy[i] ?? 0) * dt;
    pool.pz[i] = (pool.pz[i] ?? 0) + (pool.vz[i] ?? 0) * dt;
    pool.rx[i] = (pool.rx[i] ?? 0) + (pool.wx[i] ?? 0) * dt;
    pool.ry[i] = (pool.ry[i] ?? 0) + (pool.wy[i] ?? 0) * dt;
    pool.rz[i] = (pool.rz[i] ?? 0) + (pool.wz[i] ?? 0) * dt;
    i += 1;
  }

  // Write matrices + colors for alive instances.
  for (let j = 0; j < pool.alive; j++) {
    const fade = Math.min(1, (pool.life[j] ?? 0) / Math.max(0.001, (pool.maxLife[j] ?? 1) * 0.35));
    const s = (pool.size[j] ?? 0.05) * (0.4 + 0.6 * fade);
    tmpP.set(pool.px[j] ?? 0, pool.py[j] ?? 0, pool.pz[j] ?? 0);
    tmpQ.setFromEuler(tmpE.set(pool.rx[j] ?? 0, pool.ry[j] ?? 0, pool.rz[j] ?? 0));
    tmpS.set(s, s * 0.6, s);
    mesh.setMatrixAt(j, tmpM.compose(tmpP, tmpQ, tmpS));
    mesh.setColorAt(j, tmpC.setRGB(pool.color[j * 3] ?? 1, pool.color[j * 3 + 1] ?? 1, pool.color[j * 3 + 2] ?? 1));
  }
  mesh.count = pool.alive;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
}

export function ParticleFX({ theme }: { theme: Theme }) {
  const chunkRef = useRef<InstancedMesh>(null);
  const glowRef = useRef<InstancedMesh>(null);
  const flashRef = useRef<PointLight>(null);
  const flashTime = useRef(99);
  const moteTimer = useRef(0);
  const moteCount = useRef(0);

  const pools = useMemo(() => ({ chunk: makePool(CHUNK_CAP), glow: makePool(GLOW_CAP) }), []);
  const palette = useMemo(() => theme.tokenColors.map((c) => new Color(c)), [theme]);
  const gold = useMemo(() => [new Color('#ffd75e'), new Color('#fff3c2')], []);
  const dark = useMemo(() => [new Color('#241a2e'), new Color('#3a2a44')], []);
  const dust = useMemo(() => [new Color('#d8c9a8')], []);

  useEffect(() => {
    const api: FxApi = {
      confetti: (at) =>
        spawn(pools.chunk, 380, {
          position: at,
          spread: 0.4,
          velocity: [0, 5.2, 0],
          velocityJitter: 5.5,
          life: [1.8, 3.2],
          size: [0.06, 0.12],
          gravity: 7,
          drag: 0.985,
          colors: palette,
          spin: 9,
        }),
      sparkles: (at) =>
        spawn(pools.glow, 140, {
          position: at,
          spread: 0.3,
          velocity: [0, 1.6, 0],
          velocityJitter: 2.4,
          life: [0.35, 0.8],
          size: [0.04, 0.09],
          gravity: 1.5,
          drag: 0.96,
          colors: gold,
        }),
      puff: (at) =>
        spawn(pools.glow, 36, {
          position: at,
          spread: 0.25,
          velocity: [0, 0.7, 0],
          velocityJitter: 1.2,
          life: [0.4, 0.9],
          size: [0.1, 0.2],
          gravity: -0.4,
          drag: 0.92,
          colors: dark,
        }),
      dustRing: (at) => {
        // radial ring burst in the tray plane
        for (let k = 0; k < 26; k++) {
          const a = (k / 26) * Math.PI * 2;
          spawn(pools.glow, 1, {
            position: at,
            spread: 0.05,
            velocity: [Math.cos(a) * 1.6, 0.25, Math.sin(a) * 1.6],
            velocityJitter: 0.3,
            life: [0.25, 0.4],
            size: [0.03, 0.06],
            gravity: 1.2,
            drag: 0.9,
            colors: dust,
          });
        }
      },
      flash: (at) => {
        const light = flashRef.current;
        if (light !== null) {
          light.position.copy(at).add(tmpP.set(0, 0.6, 0));
          flashTime.current = 0;
        }
      },
    };
    registry.fx = api;
    return () => {
      registry.fx = null;
    };
  }, [pools, palette, gold, dark, dust]);

  useFrame((_, dt) => {
    const clamped = Math.min(dt, 0.05);
    const chunk = chunkRef.current;
    const glow = glowRef.current;
    if (chunk !== null) step(pools.chunk, chunk, clamped);
    if (glow !== null) step(pools.glow, glow, clamped);

    // Warm point-light flash decay (~400 ms).
    const light = flashRef.current;
    if (light !== null) {
      flashTime.current += clamped;
      light.intensity = Math.max(0, 1 - flashTime.current / 0.4) * 14;
    }

    // Idle life: dust motes drifting through the key-light shaft.
    moteTimer.current += clamped;
    moteCount.current = pools.glow.alive;
    if (moteTimer.current > 0.22 && moteCount.current < MOTE_TARGET) {
      moteTimer.current = 0;
      tmpP.set(2 + (Math.random() - 0.5) * 5, 2.2 + Math.random() * 2.5, 1 + (Math.random() - 0.5) * 5);
      spawn(pools.glow, 1, {
        position: tmpP,
        spread: 0.2,
        velocity: [-0.05, -0.06, -0.04],
        velocityJitter: 0.08,
        life: [5, 9],
        size: [0.012, 0.028],
        gravity: 0,
        drag: 1,
        colors: dust,
      });
    }
  });

  return (
    <group>
      <instancedMesh ref={chunkRef} args={[undefined, undefined, CHUNK_CAP]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 0.25]} />
        <meshStandardMaterial roughness={0.5} metalness={0.1} />
      </instancedMesh>
      <instancedMesh ref={glowRef} args={[undefined, undefined, GLOW_CAP]} frustumCulled={false}>
        <octahedronGeometry args={[0.5, 0]} />
        <meshBasicMaterial blending={AdditiveBlending} transparent opacity={0.85} depthWrite={false} />
      </instancedMesh>
      <pointLight ref={flashRef} intensity={0} distance={4} decay={2} color="#ffd98a" />
    </group>
  );
}
