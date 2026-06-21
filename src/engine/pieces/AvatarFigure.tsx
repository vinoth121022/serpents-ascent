import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Box3, Group, LoopRepeat, Mesh, Object3D, Vector3 } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useStore } from '../../store';

const MODEL = '/models/avatar.glb';
const TARGET_HEIGHT = 0.66; // a touch taller than the old pawn — it's a real person
const FACING = Math.PI; // model forward offset (tuned so it faces its travel direction)
const WALK_TIMESCALE = 0.85; // a slow, deliberate walk
// Compressed model uses EXT_meshopt_compression — enable the (bundled, offline) meshopt decoder.
useGLTF.preload(MODEL, false, true);

const _world = new Vector3();
const _box = new Box3();
const _size = new Vector3();

/** Real human GLB token: walks (the model's own animation) while moving, faces the
 * travel direction, and does a backflip when its player wins. Cloned per player so
 * each instance has an independent skeleton. */
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

  useEffect(() => {
    const walk = actions['Walking'];
    if (walk) {
      walk.reset().play();
      walk.setEffectiveWeight(1);
      walk.timeScale = WALK_TIMESCALE;
      walk.paused = true; // stand in a natural arms-down walk frame, never a T-pose
    }
  }, [actions]);

  // Backflip on win, return to idle on a new match.
  useEffect(() => {
    const flip = actions['Backflip'];
    const walk = actions['Walking'];
    if (phase === 'WIN' && winner === playerIndex && flip && !flipped.current) {
      flipped.current = true;
      walk?.fadeOut(0.2);
      flip.reset().setLoop(LoopRepeat, Infinity).fadeIn(0.2).play();
    } else if (phase !== 'WIN' && flipped.current) {
      flipped.current = false;
      flip?.stop();
      if (walk) {
        walk.reset();
        walk.setEffectiveWeight(1);
        walk.paused = true;
        walk.play();
      }
    }
  }, [phase, winner, playerIndex, actions]);

  useFrame((_, dt) => {
    const g = root.current;
    if (g === null) return;
    g.getWorldPosition(_world);
    if (!inited.current) {
      last.current.copy(_world);
      inited.current = true;
    }
    const dx = _world.x - last.current.x;
    const dz = _world.z - last.current.z;
    last.current.copy(_world);
    const moved = Math.hypot(dx, dz);
    const d = Math.min(dt, 0.05);

    // Walk while moving, freeze (stand) when idle — never a T-pose (skip during a win).
    const walk = actions['Walking'];
    if (walk && !flipped.current) {
      walk.paused = moved <= 0.0006;
    }

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
