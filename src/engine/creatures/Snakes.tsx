import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Box3, Color, Group, Mesh, type MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { cellToWorld, type BoardDefinition } from '../../core';
import { registry } from '../registry';
import type { Theme } from '../theme/themes';

const SNAKE_MODEL = '/models/snake.glb';
const THICKNESS = 0.42; // world body diameter the model is scaled to
const SNAKE_LIFT = 0.16; // belly height — drapes the snake OVER the ladders (no clipping)
const FORWARD = new Vector3(0, 0, 1); // the model's long axis (measured: length runs along Z)

useGLTF.preload(SNAKE_MODEL, false, true); // meshopt-compressed

/**
 * Board snakes are instances of a real textured corn-snake GLB. The model has no
 * skeleton, so each snake is a clone stretched along the straight head→tail line
 * (scaled to span the distance, fixed body thickness), tinted a distinct theme hue,
 * and lifted to lie OVER the ladders rather than clipping through them.
 */
export function Snakes({ board, theme }: { board: BoardDefinition; theme: Theme }) {
  const { scene } = useGLTF(SNAKE_MODEL, false, true);
  const breatheRef = useRef<Group>(null);

  // Measure the model once (its real, dequantized size + centre).
  const dims = useMemo(() => {
    const box = new Box3().setFromObject(scene);
    const size = new Vector3();
    const center = new Vector3();
    box.getSize(size);
    box.getCenter(center);
    return { size, center };
  }, [scene]);

  const { instances, materials } = useMemo(() => {
    registry.snakeCurves.clear();
    const length = dims.size.z || 1;
    const girth = Math.max(dims.size.x, dims.size.y) || 1;
    const materials: MeshStandardMaterial[] = [];
    const instances = board.jumps
      .filter((j) => j.kind === 'snake')
      .map((jump, i) => {
        const h = cellToWorld(jump.from);
        const t = cellToWorld(jump.to);
        const a = new Vector3(h.x, 0, h.z); // head cell
        const b = new Vector3(t.x, 0, t.z); // tail cell
        const span = a.distanceTo(b);
        // The model's head is at its +Z end, so point +Z toward the head cell.
        const dir = new Vector3().subVectors(a, b).normalize();
        const quaternion = new Quaternion().setFromUnitVectors(FORWARD, dir);
        const vary = 0.9 + (((i * 37) % 17) / 100) * 1.2; // 0.9..1.1 size variety per snake
        const sxy = (THICKNESS / girth) * vary;
        const sz = span / length;
        // One consistent hue across ALL of a snake's meshes (its "pieces" stay one style).
        // A bright base + low emissive lifts the dark scale texture so the colour reads.
        const hue = new Color(theme.snakeColors[i % theme.snakeColors.length] ?? '#3e8a5f');
        const obj = scene.clone(true) as Object3D;
        obj.position.sub(dims.center); // recentre so the body straddles the line
        obj.traverse((o) => {
          const mesh = o as Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          const src = mesh.material as MeshStandardMaterial;
          const m = src.clone();
          if (m.color) m.color.copy(hue).multiplyScalar(1.9);
          if (m.emissive) {
            m.emissive.copy(hue);
            m.emissiveIntensity = 0.32;
          }
          mesh.material = m;
          materials.push(m);
        });
        const position = new Vector3().addVectors(a, b).multiplyScalar(0.5);
        position.y = SNAKE_LIFT + (dims.size.y * sxy) / 2; // belly clears the ladders
        return { key: jump.from, obj, position, quaternion, scale: new Vector3(sxy, sxy, sz) };
      });
    return { instances, materials };
  }, [board, scene, dims, theme]);

  // Free the per-snake material clones when the board/theme changes.
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  // Subtle, shear-free breathing keeps the rigid models feeling alive.
  useFrame(({ clock }) => {
    const g = breatheRef.current;
    if (g !== null) g.scale.setScalar(1 + Math.sin(clock.elapsedTime * Math.PI * 0.8) * 0.012);
  });

  return (
    <group ref={breatheRef}>
      {instances.map((inst) => (
        <group key={inst.key} position={inst.position} quaternion={inst.quaternion} scale={inst.scale}>
          <primitive object={inst.obj} />
        </group>
      ))}
    </group>
  );
}
