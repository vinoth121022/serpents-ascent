import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Box3, Group, LoopRepeat, Mesh, Object3D, Vector3 } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useStore } from '../../store';
import { registry } from '../registry';

const MODEL = '/models/avatar.glb';
const TARGET_HEIGHT = 1.2; // a real person, sized to stand tall above its tile
const FACING = 0; // model forward offset (tuned so it faces its travel direction)
const WALK_TIMESCALE = 0.85; // a slow, deliberate walk
const CLIMB_CLIP = 'Ladder_Climb_Loop'; // real rung-by-rung climb, loops for any ladder length
const CLIMB_TIMESCALE = 0.6; // slow, deliberate climb (lower = slower limbs)
const CLIMB_LEAN = 0.6; // forward body pitch (rad) so the vertical climb clip leans up the flat ladder
const FADE = 0.18; // crossfade seconds between walk and climb
useGLTF.preload(MODEL);

const _world = new Vector3();
const _box = new Box3();
const _size = new Vector3();

/** Real human GLB token: walks while moving, plays a real ladder-climb clip while
 * scaling a ladder, faces the travel direction, and backflips when its player wins.
 * Cloned per player so each instance has an independent skeleton. */
export function AvatarFigure({ playerIndex }: { playerIndex: number }) {
  const root = useRef<Group>(null);
  const { scene, animations } = useGLTF(MODEL);
  const phase = useStore((s) => s.game.phase);
  const winner = useStore((s) => s.game.winner);

  // Clone (skinned meshes can't be shared), scale to the tile, feet to y=0.
  const model = useMemo(() => {
    const clone = cloneSkeleton(scene) as Object3D;
    clone.updateMatrixWorld(true);
    _box.setFromObject(clone, true); // precise: posed skinned vertices
    _box.getSize(_size);
    const nativeH = _size.y || 1;
    const s = TARGET_HEIGHT / nativeH;
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
  const flipped = useRef(false);
  const wasClimbing = useRef(false);

  const startWalk = useCallback((): void => {
    const walk = actions['Walking'];
    if (walk) {
      walk.reset().play();
      walk.setEffectiveWeight(1);
      walk.timeScale = WALK_TIMESCALE;
      walk.paused = true; // stand in a natural arms-down walk frame, never a T-pose
    }
  }, [actions]);

  useEffect(() => startWalk(), [startWalk]);

  // Backflip on win, return to idle on a new match.
  useEffect(() => {
    const flip = actions['Backflip'];
    const walk = actions['Walking'];
    if (phase === 'WIN' && winner === playerIndex && flip && !flipped.current) {
      flipped.current = true;
      walk?.fadeOut(0.2);
      actions[CLIMB_CLIP]?.fadeOut(0.2);
      flip.reset().setLoop(LoopRepeat, Infinity).fadeIn(0.2).play();
    } else if (phase !== 'WIN' && flipped.current) {
      flipped.current = false;
      flip?.stop();
      startWalk();
    }
  }, [phase, winner, playerIndex, actions, startWalk]);

  useFrame((_, dt) => {
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

    const climbing = !flipped.current && registry.movingToken === playerIndex && registry.movementMode === 'climb';
    const walk = actions['Walking'];
    const climb = actions[CLIMB_CLIP];

    if (climbing && !wasClimbing.current) {
      // Hand off to the real climb clip.
      wasClimbing.current = true;
      walk?.fadeOut(FADE);
      if (climb) {
        climb.reset().setLoop(LoopRepeat, Infinity);
        climb.timeScale = CLIMB_TIMESCALE;
        climb.setEffectiveWeight(1);
        climb.fadeIn(FADE).play();
      }
    } else if (!climbing && wasClimbing.current) {
      // Back to the walk clip once the ladder is cleared.
      wasClimbing.current = false;
      climb?.fadeOut(FADE);
      startWalk();
      walk?.fadeIn(FADE);
    }

    // Walk while moving, freeze (stand) when idle — never a T-pose (skip during climb/win).
    if (walk && !flipped.current && !climbing) walk.paused = moved <= 0.0006;

    // Lean forward into the rungs while climbing so the upright climb clip reads as
    // clambering up the (flat) ladder; ease back to upright otherwise.
    g.rotation.x += ((climbing ? CLIMB_LEAN : 0) - g.rotation.x) * Math.min(1, d * 5);

    // Turn to face the direction of travel.
    if (moved > 0.0009 && !flipped.current) {
      let dy = Math.atan2(dx, dz) + FACING - g.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      g.rotation.y += dy * Math.min(1, d * 8);
    }
  });

  return (
    <group ref={root} rotation-y={FACING}>
      <primitive object={model} />
    </group>
  );
}
