import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { cellToWorld, nextFloat, seedRng, type BoardDefinition } from '../../core';
import type { Theme } from '../theme/themes';

const LIFT = 0.1; // ladders float just above the tiles
const RAIL_GAP = 0.42;
const RUNG_EVERY = 0.35;

interface LadderTransforms {
  rails: Matrix4[];
  rungs: Matrix4[];
}

function buildTransforms(board: BoardDefinition): LadderTransforms {
  const rails: Matrix4[] = [];
  const rungs: Matrix4[] = [];
  const up = new Vector3(0, 1, 0);

  for (const jump of board.jumps) {
    if (jump.kind !== 'ladder') continue;
    let rng = seedRng(jump.from * 1000 + jump.to);
    const rand = (): number => {
      const [v, s] = nextFloat(rng);
      rng = s;
      return v;
    };

    const a = cellToWorld(jump.from);
    const b = cellToWorld(jump.to);
    const start = new Vector3(a.x, LIFT, a.z);
    const end = new Vector3(b.x, LIFT, b.z);
    const dir = end.clone().sub(start);
    const length = dir.length();
    const unit = dir.clone().normalize();
    const mid = start.clone().add(end).multiplyScalar(0.5);
    // Rotate the cylinder's local +Y onto the rail direction.
    const align = new Quaternion().setFromUnitVectors(up, unit);
    const perp = new Vector3(-unit.z, 0, unit.x).normalize();

    for (const side of [-1, 1]) {
      const pos = mid.clone().add(perp.clone().multiplyScalar((side * RAIL_GAP) / 2));
      rails.push(new Matrix4().compose(pos, align, new Vector3(1, length, 1)));
    }

    const count = Math.max(3, Math.round(length / RUNG_EVERY));
    const rungAlign = new Quaternion().setFromUnitVectors(up, perp);
    for (let i = 1; i < count; i++) {
      const t = i / count;
      const pos = start.clone().lerp(end, t);
      // Slight per-rung roll for a handmade feel (spec §9).
      const roll = new Quaternion().setFromAxisAngle(unit, (rand() - 0.5) * 0.14);
      rungs.push(new Matrix4().compose(pos, roll.multiply(rungAlign), new Vector3(1, 1, 1)));
    }
  }
  return { rails, rungs };
}

/** All rails in one InstancedMesh, all rungs in another — 2 draw calls for every ladder. */
export function Ladders({ board, theme }: { board: BoardDefinition; theme: Theme }) {
  const railsRef = useRef<InstancedMesh>(null);
  const rungsRef = useRef<InstancedMesh>(null);
  const { rails, rungs } = useMemo(() => buildTransforms(board), [board]);

  useLayoutEffect(() => {
    const railMesh = railsRef.current;
    const rungMesh = rungsRef.current;
    if (railMesh === null || rungMesh === null) return;
    rails.forEach((m, i) => railMesh.setMatrixAt(i, m));
    rungs.forEach((m, i) => rungMesh.setMatrixAt(i, m));
    railMesh.instanceMatrix.needsUpdate = true;
    rungMesh.instanceMatrix.needsUpdate = true;
    railMesh.count = rails.length;
    rungMesh.count = rungs.length;
  }, [rails, rungs]);

  return (
    <group>
      <instancedMesh ref={railsRef} args={[undefined, undefined, rails.length]} castShadow>
        {/* unit-height cylinder, scaled per instance to the rail length */}
        <cylinderGeometry args={[0.045, 0.045, 1, 10]} />
        <meshStandardMaterial
          color={theme.ladderWood.color}
          roughness={theme.ladderWood.roughness}
          metalness={theme.ladderWood.metalness}
        />
      </instancedMesh>
      <instancedMesh ref={rungsRef} args={[undefined, undefined, Math.max(rungs.length, 1)]} castShadow>
        <cylinderGeometry args={[0.032, 0.032, RAIL_GAP + 0.08, 8]} />
        <meshStandardMaterial
          color={theme.ladderWood.color}
          roughness={theme.ladderWood.roughness}
          metalness={theme.ladderWood.metalness}
        />
      </instancedMesh>
    </group>
  );
}
