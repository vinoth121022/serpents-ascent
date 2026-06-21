import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Box3, Group, LoopOnce, LoopRepeat, Mesh, Object3D, Vector3 } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useStore } from '../../store';
import { registry } from '../registry';

const MODEL = '/models/avatar.glb';
const TARGET_HEIGHT = 1.2; // a real person, sized to stand tall above its tile
const FACING = 0; // model forward offset (tuned so it faces its travel direction)
const CLIMB_LEAN = 0.6; // forward body pitch so the upright climb clip reads up the flat ladder
const FADE = 0.18; // crossfade seconds between clips

// Clip names in the model, mapped to game states.
const CLIP = {
  idle: 'Stand_and_Chat', // alive, gesturing idle while waiting its turn
  walk: 'Walking',
  climb: 'Slow_Ladder_Climb',
  snake: 'Jump_Over_Obstacle_2', // crossing/sliding a snake
  cheer: 'happy_jump_m', // celebrate at the top of a ladder
  win: 'Backflip',
} as const;
const TIMESCALE: Record<string, number> = { [CLIP.walk]: 0.85, [CLIP.climb]: 0.6 };

useGLTF.preload(MODEL, false, true);

const _world = new Vector3();
const _box = new Box3();
const _size = new Vector3();

/** Real human GLB token with a small animation state machine: stands (Standing_Reload)
 * when idle, walks when moving, plays a slow ladder climb and a happy jump at the top,
 * a jump-over-obstacle while crossing a snake, and a backflip on win. Cloned per player. */
export function AvatarFigure({ playerIndex }: { playerIndex: number }) {
  const root = useRef<Group>(null);
  const { scene, animations } = useGLTF(MODEL, false, true);
  const phase = useStore((s) => s.game.phase);
  const winner = useStore((s) => s.game.winner);

  // Clone (skinned meshes can't be shared), scale to the tile, feet to y=0.
  const model = useMemo(() => {
    const clone = cloneSkeleton(scene) as Object3D;
    clone.updateMatrixWorld(true);
    _box.setFromObject(clone, true); // precise: posed skinned vertices
    _box.getSize(_size);
    const s = TARGET_HEIGHT / (_size.y || 1);
    clone.scale.setScalar(s);
    clone.updateMatrixWorld(true);
    _box.setFromObject(clone, true);
    clone.position.y = -_box.min.y; // feet to y = 0
    clone.traverse((o) => {
      if ((o as Mesh).isMesh) o.castShadow = true;
    });
    return clone;
  }, [scene]);

  const { actions } = useAnimations(animations, model);

  const last = useRef(new Vector3());
  const inited = useRef(false);
  const current = useRef(''); // currently playing clip
  const wasClimbing = useRef(false);
  const cheerTimer = useRef(0); // seconds of "happy jump" left after a climb

  // Crossfade to a clip (no-op if already playing it).
  const playClip = useCallback(
    (name: string, loop: boolean): void => {
      if (current.current === name) return;
      const next = actions[name];
      if (!next) return;
      actions[current.current]?.fadeOut(FADE);
      next.reset();
      next.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
      next.clampWhenFinished = !loop;
      next.timeScale = TIMESCALE[name] ?? 1;
      next.setEffectiveWeight(1);
      next.fadeIn(FADE).play();
      current.current = name;
    },
    [actions],
  );

  // Stand the moment the clips are ready (avoids a one-frame bind/T-pose).
  useEffect(() => playClip(CLIP.idle, true), [playClip]);

  useFrame((st, dt) => {
    const g = root.current;
    if (g === null) return;
    g.getWorldPosition(_world);
    if (!inited.current) {
      g.rotation.order = 'YXZ'; // yaw first, then pitch — so the climb lean follows the facing
      last.current.copy(_world);
      inited.current = true;
    }
    const dx = _world.x - last.current.x;
    const dz = _world.z - last.current.z;
    last.current.copy(_world);
    const moved = Math.hypot(dx, dz);
    const d = Math.min(dt, 0.05);

    const winningMe = phase === 'WIN' && winner === playerIndex;
    const active = registry.movingToken === playerIndex;
    const mode = active ? registry.movementMode : null;
    const climbing = mode === 'climb';

    // Celebrate at the top of a ladder: a climb that just ended fires a one-shot happy jump.
    if (wasClimbing.current && !climbing && !winningMe) {
      cheerTimer.current = actions[CLIP.cheer]?.getClip().duration ?? 0.9;
    }
    wasClimbing.current = climbing;
    // Tell the camera to hold on this piece while it enjoys the celebration.
    if (cheerTimer.current > 0) {
      cheerTimer.current -= dt;
      registry.celebrating = playerIndex;
    } else if (registry.celebrating === playerIndex) {
      registry.celebrating = null;
    }

    // Pick the clip for the current state.
    let want: string = CLIP.idle;
    let loop = true;
    if (winningMe) want = CLIP.win;
    else if (climbing) want = CLIP.climb;
    else if (mode === 'slide') {
      want = CLIP.snake; // jump-over-obstacle: play once and clamp on the landing pose
      loop = false;
    } else if (cheerTimer.current > 0) {
      want = CLIP.cheer;
      loop = false;
    } else if (mode === 'walk') want = CLIP.walk;
    playClip(want, loop);

    // Lean forward into the rungs while climbing; ease back to upright otherwise.
    g.rotation.x += ((climbing ? CLIMB_LEAN : 0) - g.rotation.x) * Math.min(1, d * 5);

    // Facing: while actually walking/climbing/sliding the piece faces its travel
    // direction; the moment it stops (idle, celebrating, after any move) it turns back
    // to face the camera, so the figure always "presents" to the viewer at rest.
    const traversing = (mode === 'walk' || mode === 'climb' || mode === 'slide') && moved > 0.0009;
    if (!winningMe) {
      const targetYaw = traversing
        ? Math.atan2(dx, dz) + FACING
        : Math.atan2(st.camera.position.x - _world.x, st.camera.position.z - _world.z) + FACING;
      let dy = targetYaw - g.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      g.rotation.y += dy * Math.min(1, d * (traversing ? 8 : 5));
    }
  });

  return (
    <group ref={root} rotation-y={FACING}>
      <primitive object={model} />
    </group>
  );
}
