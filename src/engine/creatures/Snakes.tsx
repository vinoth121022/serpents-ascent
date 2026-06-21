import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, Color, Group, Mesh, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BoardDefinition } from '../../core';
import { registry } from '../registry';
import type { Theme } from '../theme/themes';
import { buildSnakeCurve, buildTaperedTube } from './snakeGeometry';

interface HeadPose {
  position: Vector3;
  quaternion: Quaternion;
  color: string;
}

/**
 * All snake bodies merge into ONE vertex-colored geometry (1 draw call); heads,
 * eyes and tongues are small per-snake groups. Splines register in the registry
 * so the choreographer can slide tokens down the real body.
 */
export function Snakes({ board, theme }: { board: BoardDefinition; theme: Theme }) {
  const breatheRef = useRef<Group>(null);
  const headRefs = useRef<(Group | null)[]>([]);
  const tongueRefs = useRef<(Mesh | null)[]>([]);

  const { bodyGeometry, shellGeometry, heads } = useMemo(() => {
    const snakes = board.jumps.filter((j) => j.kind === 'snake');
    registry.snakeCurves.clear();
    const tubes = [];
    const shells = [];
    const heads: HeadPose[] = [];
    const up = new Vector3(0, 1, 0);
    for (let i = 0; i < snakes.length; i++) {
      const jump = snakes[i];
      if (jump === undefined) continue;
      const color = theme.snakeColors[i % theme.snakeColors.length] ?? '#3e8a5f';
      const curve = buildSnakeCurve(jump.from, jump.to);
      registry.snakeCurves.set(jump.from, curve);
      tubes.push(buildTaperedTube(curve, new Color(color)));
      // Radially inflated copy for the additive self-glow shell — a uniform mesh
      // scale would shift, not inflate, so the shell is baked at a larger radius.
      shells.push(buildTaperedTube(curve, new Color(color), 72, 10, 0.118, 0.036));

      // Head: oriented against the travel direction, tilted slightly up.
      const p0 = curve.getPointAt(0);
      const tangent = curve.getTangentAt(0).negate();
      tangent.y = Math.max(tangent.y, 0.15);
      tangent.normalize();
      const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), tangent);
      const lift = new Quaternion().setFromAxisAngle(up, 0);
      heads.push({ position: p0, quaternion: quaternion.multiply(lift), color });
    }
    const merged = mergeGeometries(tubes, false);
    const mergedShell = mergeGeometries(shells, false);
    for (const t of tubes) t.dispose();
    for (const s of shells) s.dispose();
    return { bodyGeometry: merged, shellGeometry: mergedShell, heads };
  }, [board, theme]);

  useEffect(() => {
    return () => {
      bodyGeometry.dispose();
      shellGeometry.dispose();
    };
  }, [bodyGeometry, shellGeometry]);

  // Idle life: breathing body + heads that look around / nod, and flicking tongues —
  // each snake on its own phase so they feel like separate live creatures.
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const g = breatheRef.current;
    if (g !== null) {
      const s = 1 + Math.sin(t * Math.PI * 0.8) * 0.02;
      g.scale.set(1, s, 1);
    }
    for (let i = 0; i < headRefs.current.length; i++) {
      const head = headRefs.current[i];
      if (head !== null && head !== undefined) {
        head.rotation.y = Math.sin(t * 1.05 + i * 1.3) * 0.2; // glance left/right
        head.rotation.x = Math.sin(t * 0.75 + i * 0.7) * 0.09; // gentle nod
        head.position.y = Math.sin(t * 0.9 + i) * 0.015; // rise and fall
      }
      const tongue = tongueRefs.current[i];
      if (tongue !== null && tongue !== undefined) {
        const dart = Math.max(0, Math.sin(t * 2.2 + i * 2.1));
        tongue.scale.y = 0.15 + 0.85 * dart * dart; // quick flick in and out
      }
    }
  });

  return (
    <group>
      <group ref={breatheRef}>
        <mesh geometry={bodyGeometry} castShadow>
          <meshStandardMaterial vertexColors roughness={0.55} metalness={0.0} envMapIntensity={0.65} />
        </mesh>
        {theme.snakeEmissiveIntensity > 0 && (
          // Additive shell = saturation lift + self-glow (DECISIONS.md #9)
          <mesh geometry={shellGeometry}>
            <meshBasicMaterial
              vertexColors
              transparent
              opacity={theme.snakeEmissiveIntensity}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        )}
      </group>
      {heads.map((head, i) => (
        <group key={i} position={head.position} quaternion={head.quaternion}>
          {/* inner group is animated each frame (glance / nod / bob) — the snake is alive */}
          <group
            ref={(g) => {
              headRefs.current[i] = g;
            }}
          >
            {/* flattened, elongated reptilian head */}
            <mesh scale={[1.25, 0.6, 1.95]} castShadow>
              <sphereGeometry args={[0.14, 18, 14]} />
              <meshStandardMaterial color={head.color} roughness={0.5} metalness={0.0} envMapIntensity={0.65} />
            </mesh>
            {/* eyes */}
            {[-1, 1].map((side) => (
              <group key={side} position={[side * 0.085, 0.07, 0.06]}>
                <mesh>
                  <sphereGeometry args={[0.035, 10, 8]} />
                  <meshStandardMaterial color="#f6f3e6" roughness={0.25} />
                </mesh>
                <mesh position={[0, 0.012, 0.022]}>
                  <sphereGeometry args={[0.016, 8, 6]} />
                  <meshStandardMaterial color="#181410" roughness={0.2} />
                </mesh>
              </group>
            ))}
            {/* forked tongue — flicks in and out */}
            <mesh
              ref={(m) => {
                tongueRefs.current[i] = m;
              }}
              position={[0, -0.01, 0.3]}
              rotation={[-0.25, 0, 0]}
            >
              <planeGeometry args={[0.05, 0.18]} />
              <meshBasicMaterial color="#c83a4a" side={2} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
