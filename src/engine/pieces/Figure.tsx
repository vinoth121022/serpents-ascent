import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Group, Vector3 } from 'three';
import type { Gender } from '../../store';

const SKIN = '#cf9f72';
const HAIR = '#2a211a';
const SHOE = '#23262b';
const PANTS = '#39414b';

const _world = new Vector3();

/**
 * Articulated human token: head/hair/torso + hip-pivoted legs and shoulder-pivoted
 * arms, so it can WALK. The walk cycle is driven by the token's own ground speed
 * (measured from world-position delta each frame) — so it strides while the
 * choreographer slides it cell-to-cell and stands still when idle. It also turns to
 * face the direction of travel.
 */
export function Figure({ gender, color }: { gender: Gender; color: string }) {
  const root = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);

  const phase = useRef(0);
  const swing = useRef(0);
  const last = useRef(new Vector3());
  const inited = useRef(false);

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

    // Amplitude ramps with horizontal speed; phase advances with distance so the
    // stride matches ground speed. Decays to a neutral stand when stationary.
    const target = moved > 0.0006 ? 1 : 0;
    swing.current += (target - swing.current) * Math.min(1, d * 12);
    phase.current += moved * 11;
    const s = Math.sin(phase.current) * swing.current;

    if (legL.current) legL.current.rotation.x = s * 0.85;
    if (legR.current) legR.current.rotation.x = -s * 0.85;
    if (armL.current) armL.current.rotation.x = -s * 0.5;
    if (armR.current) armR.current.rotation.x = s * 0.5;

    // Turn to face travel direction (figure front is +z).
    if (moved > 0.0009) {
      let dy = Math.atan2(dx, dz) - g.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      g.rotation.y += dy * Math.min(1, d * 8);
    }
  });

  const isF = gender === 'female';

  return (
    <group ref={root}>
      {/* head */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <sphereGeometry args={[0.066, 16, 14]} />
        <meshStandardMaterial color={SKIN} roughness={0.62} metalness={0} />
      </mesh>
      {/* hair */}
      <mesh position={[0, 0.575, isF ? -0.008 : 0]} scale={isF ? [1.16, 1.18, 1.24] : [1.12, 0.72, 1.12]} castShadow>
        <sphereGeometry args={[0.066, 14, 12]} />
        <meshStandardMaterial color={HAIR} roughness={0.85} metalness={0} />
      </mesh>
      {isF && (
        <mesh position={[0, 0.485, -0.05]} castShadow>
          <sphereGeometry args={[0.062, 12, 10]} />
          <meshStandardMaterial color={HAIR} roughness={0.85} />
        </mesh>
      )}
      {/* neck */}
      <mesh position={[0, 0.49, 0]}>
        <cylinderGeometry args={[0.024, 0.028, 0.05, 10]} />
        <meshStandardMaterial color={SKIN} roughness={0.62} />
      </mesh>
      {/* torso (clothing color) */}
      <mesh position={[0, 0.39, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.072, 0.18, 16]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.03} />
      </mesh>
      {isF && (
        <mesh position={[0, 0.27, 0]} castShadow>
          <cylinderGeometry args={[0.075, 0.132, 0.16, 18]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      )}

      {/* legs — pivot at the hip (y≈0.30) so they swing from the top */}
      <group ref={legL} position={[-0.045, 0.3, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow>
          <cylinderGeometry args={[0.034, 0.03, 0.3, 10]} />
          <meshStandardMaterial color={isF ? SKIN : PANTS} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.305, 0.022]} castShadow>
          <boxGeometry args={[0.06, 0.04, 0.11]} />
          <meshStandardMaterial color={SHOE} roughness={0.5} />
        </mesh>
      </group>
      <group ref={legR} position={[0.045, 0.3, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow>
          <cylinderGeometry args={[0.034, 0.03, 0.3, 10]} />
          <meshStandardMaterial color={isF ? SKIN : PANTS} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.305, 0.022]} castShadow>
          <boxGeometry args={[0.06, 0.04, 0.11]} />
          <meshStandardMaterial color={SHOE} roughness={0.5} />
        </mesh>
      </group>

      {/* arms — pivot at the shoulder (y≈0.45) */}
      <group ref={armL} position={[-0.1, 0.45, 0]}>
        <mesh position={[0, -0.12, 0]} castShadow>
          <cylinderGeometry args={[0.026, 0.022, 0.24, 8]} />
          <meshStandardMaterial color={isF ? SKIN : color} roughness={0.55} />
        </mesh>
        <mesh position={[0, -0.25, 0]} castShadow>
          <sphereGeometry args={[0.027, 8, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.62} />
        </mesh>
      </group>
      <group ref={armR} position={[0.1, 0.45, 0]}>
        <mesh position={[0, -0.12, 0]} castShadow>
          <cylinderGeometry args={[0.026, 0.022, 0.24, 8]} />
          <meshStandardMaterial color={isF ? SKIN : color} roughness={0.55} />
        </mesh>
        <mesh position={[0, -0.25, 0]} castShadow>
          <sphereGeometry args={[0.027, 8, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.62} />
        </mesh>
      </group>
    </group>
  );
}
