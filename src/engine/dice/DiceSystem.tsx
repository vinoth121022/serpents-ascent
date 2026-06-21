import { useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, Physics, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { BufferGeometry, Group, Quaternion, SphereGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DIE_FACES, faceUp, must, orientationShowing, type Quat } from '../../core';
import { useStore } from '../../store';
import { soundBus } from '../../ui/sound/SoundBus';
import { registry } from '../registry';
import type { Theme } from '../theme/themes';

const DIE_SIZE = 0.62;
const HALF = DIE_SIZE / 2;
// Correct the die WHILE it is still finishing its roll on the floor — never after it
// has come to a dead stop (that "land, pause, then rotate" is the glitch we're killing).
const SETTLE_LIN = 0.7; // still some travel
const SETTLE_ANG = 2.4; // still rotating slowly
const SETTLE_FLOOR = 0.12; // must be resting near the tray floor (not mid-bounce)
const SETTLE_MIN_AIR = 0.45; // ignore the throw + first bounces
const STILL_SETTLE = 0.3; // low-energy but not flat-on-floor (corner-rested) → flatten after this
const HARD_TIMEOUT = 2.2; // final backstop if it somehow never reads as still
const SETTLE_SECONDS = 0.3; // quick eased steer that merges with the deceleration

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/** Pip offsets per face value, in face-local (u, v) units. */
const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

/** All 21 pips merged into one inset geometry (1 draw call). */
function makePipGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const o = 0.155;
  for (const face of DIE_FACES) {
    const [nx, ny, nz] = face.normal;
    // Tangent basis for the face plane.
    const u: [number, number, number] = nx !== 0 ? [0, 1, 0] : [1, 0, 0];
    const v: [number, number, number] = [
      ny * u[2] - nz * u[1],
      nz * u[0] - nx * u[2],
      nx * u[1] - ny * u[0],
    ];
    for (const [pu, pv] of must(PIP_LAYOUT[face.value])) {
      const g = new SphereGeometry(0.055, 10, 8);
      g.translate(
        nx * (HALF - 0.012) + u[0] * pu * o + v[0] * pv * o,
        ny * (HALF - 0.012) + u[1] * pu * o + v[1] * pv * o,
        nz * (HALF - 0.012) + u[2] * pu * o + v[2] * pv * o,
      );
      parts.push(g);
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

type DiceMode = 'idle' | 'flying' | 'reconciling';

interface TrayLayout {
  center: Vector3;
  inner: number;
}

function trayLayout(aspect: number): TrayLayout {
  // In FRONT of the board (toward the camera) so the full-height right sidebar
  // never covers the die — it must stay clickable to roll. Portrait sits a touch lower.
  return aspect >= 1
    ? { center: new Vector3(0, 0, 7.2), inner: 1.5 }
    : { center: new Vector3(0, 0, 7.7), inner: 1.5 };
}

const FLOOR_TOP = -0.19;

function Tray({ layout, theme }: { layout: TrayLayout; theme: Theme }) {
  const wall = 0.14;
  const height = 0.46;
  const span = layout.inner + wall / 2;
  const c = layout.center;
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[layout.inner + wall, 0.1, layout.inner + wall]} position={[c.x, FLOOR_TOP - 0.1, c.z]} />
        <CuboidCollider args={[wall / 2, height, layout.inner + wall]} position={[c.x - span - wall / 2, FLOOR_TOP + height - 0.1, c.z]} />
        <CuboidCollider args={[wall / 2, height, layout.inner + wall]} position={[c.x + span + wall / 2, FLOOR_TOP + height - 0.1, c.z]} />
        <CuboidCollider args={[layout.inner + wall, height, wall / 2]} position={[c.x, FLOOR_TOP + height - 0.1, c.z - span - wall / 2]} />
        <CuboidCollider args={[layout.inner + wall, height, wall / 2]} position={[c.x, FLOOR_TOP + height - 0.1, c.z + span + wall / 2]} />
      </RigidBody>
      {/* visuals */}
      <mesh position={[c.x, FLOOR_TOP - 0.06, c.z]} receiveShadow>
        <boxGeometry args={[(layout.inner + wall) * 2 + 0.1, 0.12, (layout.inner + wall) * 2 + 0.1]} />
        <meshStandardMaterial color={theme.tray.color} roughness={theme.tray.roughness} metalness={theme.tray.metalness} />
      </mesh>
      {[
        [c.x - span - wall / 2, c.z, wall, (layout.inner + wall) * 2 + 0.1],
        [c.x + span + wall / 2, c.z, wall, (layout.inner + wall) * 2 + 0.1],
        [c.x, c.z - span - wall / 2, (layout.inner + wall) * 2 + 0.1, wall],
        [c.x, c.z + span + wall / 2, (layout.inner + wall) * 2 + 0.1, wall],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x ?? 0, FLOOR_TOP + 0.17, z ?? 0]} castShadow receiveShadow>
          <boxGeometry args={[w ?? 0, 0.46, d ?? 0]} />
          <meshStandardMaterial color={theme.tray.color} roughness={theme.tray.roughness} metalness={theme.tray.metalness} />
        </mesh>
      ))}
    </group>
  );
}

function Die({ layout, theme }: { layout: TrayLayout; theme: Theme }) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const bobRef = useRef<Group>(null);
  // Pronounced rounded-cube ("curved cubic") die — more segments + larger corner radius.
  const dieGeometry = useMemo(() => new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 6, 0.13), []);
  const pipGeometry = useMemo(() => makePipGeometry(), []);

  const mode = useRef<DiceMode>('idle');
  const airTime = useRef(0);
  const slerpT = useRef(0);
  const slerpFrom = useRef(new Quaternion());
  const slerpTo = useRef(new Quaternion());
  const settledFace = useRef(0);
  const bounced = useRef(false);
  const stillTime = useRef(0); // how long the die has been low-energy
  const settleFromPos = useRef(new Vector3());
  const settleToPos = useRef(new Vector3());

  const restPosition = useMemo(
    () => new Vector3(layout.center.x, FLOOR_TOP + HALF + 0.01, layout.center.z),
    [layout],
  );

  // Diegetic interaction: the die itself is the roll control (no screen-space button).
  // Guarantee the cursor is restored if the die unmounts mid-hover.
  useEffect(() => () => { document.body.style.cursor = 'auto'; }, []);

  // React to roll requests.
  useEffect(
    () =>
      useStore.subscribe((state, prev) => {
        if (state.game.phase !== 'DICE_ROLLING' || prev.game.phase === 'DICE_ROLLING') return;
        if (state.instantMode) {
          queueMicrotask(() => useStore.getState().onDiceSettled());
          return;
        }
        const body = bodyRef.current;
        if (body === null) {
          queueMicrotask(() => useStore.getState().onDiceSettled());
          return;
        }
        // Throw: teleport above the tray, hurl with randomized impulse + torque.
        // Visual randomness only — the outcome was decided by core/ before this.
        const r = (k: number): number => (Math.random() * 2 - 1) * k;
        body.setBodyType(0, true); // dynamic
        body.setTranslation(
          { x: layout.center.x + r(0.5), y: FLOOR_TOP + 2.3, z: layout.center.z + r(0.5) },
          true,
        );
        body.setRotation({ x: Math.random(), y: Math.random(), z: Math.random(), w: Math.random() + 0.2 }, true);
        body.setLinvel({ x: r(2.2), y: -3.5, z: r(2.2) }, true);
        body.setAngvel({ x: r(14), y: r(14), z: r(14) }, true);
        mode.current = 'flying';
        airTime.current = 0;
        bounced.current = false;
        stillTime.current = 0;
        soundBus.play('roll');
      }),
    [layout],
  );

  function beginReconcile(target: number, current: Quat): void {
    const body = bodyRef.current;
    if (body === null) return;
    settledFace.current = faceUp(current);
    // Always settle to the nearest FLAT orientation that shows the target face — even
    // when the natural face already matches, this just flattens a corner-rested die.
    const corrected = orientationShowing(target, current);
    slerpFrom.current.set(current.x, current.y, current.z, current.w);
    slerpTo.current.set(corrected.x, corrected.y, corrected.z, corrected.w);
    const p = body.translation();
    settleFromPos.current.set(p.x, p.y, p.z);
    settleToPos.current.set(p.x, FLOOR_TOP + HALF, p.z); // drop flat onto the tray floor in place
    body.setBodyType(2, true); // kinematic: we drive the final settle cleanly (no physics jitter)
    slerpT.current = 0;
    mode.current = 'reconciling';
  }

  function finish(target: number): void {
    const body = bodyRef.current;
    // We settled the die TO slerpTo, so that's the authoritative final orientation.
    const q = slerpTo.current;
    const finalFace = faceUp({ x: q.x, y: q.y, z: q.z, w: q.w });
    const entry = {
      core: target,
      settledFace: settledFace.current,
      finalFace,
      ok: finalFace === target,
      corrected: settledFace.current !== target,
    };
    registry.diceLog.push(entry);
    if (registry.diceLog.length > 200) registry.diceLog.shift();
    if (import.meta.env.DEV) {
      console.assert(entry.ok, '[dice] reconciliation failed', entry);
    }
    soundBus.play('land'); // the die hits the tray
    body?.sleep();
    mode.current = 'idle';
    useStore.getState().onDiceSettled();
  }

  useFrame((state, dt) => {
    const body = bodyRef.current;
    if (body === null) return;
    const phase = useStore.getState().game.phase;

    if (mode.current === 'flying') {
      airTime.current += dt;
      const lv = body.linvel();
      const av = body.angvel();
      const speed = Math.hypot(lv.x, lv.y, lv.z);
      const spin = Math.hypot(av.x, av.y, av.z);
      const target = must(useStore.getState().game.turn.die, 'flying die with no core value');
      const onFloor = body.translation().y < FLOOR_TOP + HALF + SETTLE_FLOOR;
      const lowEnergy = speed < SETTLE_LIN && spin < SETTLE_ANG;
      stillTime.current = lowEnergy ? stillTime.current + dt : 0;
      if (airTime.current > SETTLE_MIN_AIR && lowEnergy && onFloor) {
        // Ideal: came to rest flat on the tray floor.
        beginReconcile(target, body.rotation() as Quat);
      } else if (airTime.current > SETTLE_MIN_AIR && stillTime.current > STILL_SETTLE) {
        // Came to rest balanced on a corner/edge (not flat) — flatten in place NOW rather
        // than letting the die sit there until the hard timeout (the "stuck die" bug).
        body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        beginReconcile(target, body.rotation() as Quat);
      } else if (airTime.current > HARD_TIMEOUT) {
        // Still tumbling after the backstop window — snap home and settle.
        body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        body.setTranslation(restPosition, false);
        beginReconcile(target, body.rotation() as Quat);
      }
      // First tray contact kicks a dust ring.
      if (!bounced.current && airTime.current > 0.05) {
        const pos = body.translation();
        if (pos.y < FLOOR_TOP + HALF + 0.06) {
          bounced.current = true;
          registry.fx?.dustRing(new Vector3(pos.x, FLOOR_TOP + 0.02, pos.z));
        }
      }
      return;
    }

    if (mode.current === 'reconciling') {
      // Controlled, eased settle: orientation flattens onto the target face while the
      // die drops the last sliver to the floor — reads as the die's own final roll.
      slerpT.current = Math.min(slerpT.current + dt / SETTLE_SECONDS, 1);
      const e = easeOutCubic(slerpT.current);
      const q = slerpFrom.current.clone().slerp(slerpTo.current, e);
      const p = settleFromPos.current.clone().lerp(settleToPos.current, e);
      body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
      if (slerpT.current >= 1) {
        const target = must(useStore.getState().game.turn.die);
        finish(target);
      }
      return;
    }

    // Idle life: the die bobs gently in its tray while waiting (spec §1).
    const bob = bobRef.current;
    if (bob !== null && phase === 'AWAITING_ROLL') {
      const t = state.clock.elapsedTime;
      bob.position.y = Math.sin(t * 1.3) * 0.018;
      bob.rotation.y = Math.sin(t * 0.7) * 0.03;
    } else if (bob !== null) {
      bob.position.y = 0;
      bob.rotation.y = 0;
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      colliders="cuboid"
      restitution={0.28}
      friction={0.7}
      angularDamping={0.75}
      linearDamping={0.2}
      position={[restPosition.x, restPosition.y, restPosition.z]}
    >
      <group
        ref={bobRef}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (useStore.getState().game.phase === 'AWAITING_ROLL') document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
        }}
        onClick={(e) => {
          e.stopPropagation();
          useStore.getState().roll(); // no-op unless AWAITING_ROLL; core decides the value
        }}
      >
        {/* Generous invisible hit volume — makes the die easy to click/tap (renders
            nothing: no colour, no depth) without changing how the die looks. */}
        <mesh>
          <boxGeometry args={[1.15, 1.15, 1.15]} />
          <meshBasicMaterial colorWrite={false} depthWrite={false} />
        </mesh>
        <mesh geometry={dieGeometry} castShadow>
          <meshPhysicalMaterial
            color={theme.die.color}
            roughness={theme.die.roughness}
            metalness={theme.die.metalness}
            clearcoat={0.5}
            clearcoatRoughness={0.3}
          />
        </mesh>
        <mesh geometry={pipGeometry}>
          <meshStandardMaterial color={theme.pip} roughness={0.35} metalness={0.1} />
        </mesh>
      </group>
    </RigidBody>
  );
}

export function DiceSystem({ theme }: { theme: Theme }) {
  const aspect = useThree((s) => s.size.width / s.size.height);
  const layout = useMemo(() => trayLayout(aspect), [aspect]);
  const phase = useStore((s) => s.game.phase);

  // Publish the tray location so the camera can focus on it while rolling.
  useEffect(() => {
    registry.diceTrayPos = new Vector3(layout.center.x, 0.35, layout.center.z);
    return () => {
      registry.diceTrayPos = null;
    };
  }, [layout]);

  return (
    <group>
      <Physics gravity={[0, -19.6, 0]} paused={phase !== 'DICE_ROLLING'} key={layout.center.x}>
        <Tray layout={layout} theme={theme} />
        <Die layout={layout} theme={theme} />
      </Physics>
    </group>
  );
}
