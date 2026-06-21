import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { useStore } from '../../store';
import type { Choreographer } from './choreographer';
import { stagingPosition, tokenRestPosition } from './choreographer';
import { registry } from '../registry';
import type { Theme } from '../theme/themes';
import { AvatarFigure } from './AvatarFigure';
import { Figure } from './Figure';

/** Radial-gradient blob — the cheap dynamic contact shadow (DECISIONS.md #6). */
function makeBlobTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx !== null) {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(c);
}

// Blob quads are XY planes; lay them flat via the per-instance quaternion
// (the mesh itself stays unrotated — instance matrices compose with it).
const BLOB_Q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const tmpM = new Matrix4();
const tmpV = new Vector3();
const tmpScale = new Vector3();

export function Tokens({ theme, choreographer }: { theme: Theme; choreographer: Choreographer }) {
  const playerCount = useStore((s) => s.game.players.length);
  const playerGenders = useStore((s) => s.playerGenders);
  const playerColors = useStore((s) => s.playerColors);
  const blobTexture = useMemo(() => makeBlobTexture(), []);

  // Per-player color/figure with safe fallbacks (presentation lives outside core).
  const colorFor = (i: number): string => playerColors[i] ?? theme.tokenColors[i % 4] ?? '#ffffff';
  const refs = useRef<(Group | null)[]>([]);
  const blobsRef = useRef<InstancedMesh>(null);

  useEffect(() => {
    registry.tokens = refs.current;
    return () => {
      registry.tokens = [];
    };
  }, [playerCount]);

  // Snap tokens to their rest cells whenever a new game starts.
  useEffect(
    () =>
      useStore.subscribe((state, prev) => {
        if (state.game.log[0] !== prev.game.log[0]) {
          choreographer.cancel();
          state.game.players.forEach((_, i) => {
            refs.current[i]?.position.copy(tokenRestPosition(state.game, i));
          });
        }
      }),
    [choreographer],
  );

  useFrame((_, dt) => {
    choreographer.tick(Math.min(dt, 0.05));

    // Idle tokens ease toward their rest slots (handles shared-cell shuffles), and
    // shrink a little when sharing a cell so cohabiting figures sit inside one tile.
    const game = useStore.getState().game;
    for (let i = 0; i < game.players.length; i++) {
      if (registry.movingToken === i) continue;
      const token = refs.current[i];
      if (token === null || token === undefined) continue;
      const me = game.players[i];
      if (me === undefined) continue;
      const rest = tokenRestPosition(game, i);
      token.position.lerp(rest, Math.min(1, dt * 8));
      const share = me.cell > 0 ? game.players.filter((p) => p.cell === me.cell).length : 1;
      const targetScale = share >= 3 ? 0.66 : share === 2 ? 0.82 : 1;
      const ns = token.scale.x + (targetScale - token.scale.x) * Math.min(1, dt * 8);
      token.scale.setScalar(ns);
    }

    // Blob shadows track tokens; they shrink/fade with hop height.
    const blobs = blobsRef.current;
    if (blobs !== null) {
      for (let i = 0; i < game.players.length; i++) {
        const token = refs.current[i];
        if (token === null || token === undefined) continue;
        const h = Math.max(0, Math.min(token.position.y, 1));
        const s = 0.62 * (1 - h * 0.45);
        tmpV.set(token.position.x, 0.006, token.position.z);
        tmpScale.set(s, s, s);
        blobs.setMatrixAt(i, tmpM.compose(tmpV, BLOB_Q, tmpScale));
      }
      blobs.instanceMatrix.needsUpdate = true;
    }
  });

  const game = useStore.getState().game;

  return (
    <group>
      {Array.from({ length: playerCount }, (_, i) => (
        <group
          key={i}
          ref={(g) => {
            refs.current[i] = g;
            registry.tokens = refs.current;
          }}
          position={tokenRestPosition(game, i)}
        >
          {/* Real human GLB avatar; the procedural figure shows while it streams in. */}
          <Suspense fallback={<Figure gender={playerGenders[i] ?? (i % 2 === 0 ? 'male' : 'female')} color={colorFor(i)} />}>
            <AvatarFigure playerIndex={i} />
          </Suspense>
          {/* colored player ring at the feet — differentiates identical avatars */}
          <mesh position={[0, 0.016, 0]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.26, 0.34, 32]} />
            <meshStandardMaterial color={colorFor(i)} emissive={colorFor(i)} emissiveIntensity={0.4} roughness={0.5} side={2} />
          </mesh>
        </group>
      ))}
      {/* home pads */}
      {Array.from({ length: playerCount }, (_, i) => {
        const p = stagingPosition(i);
        return (
          <mesh key={`pad-${i}`} position={[p.x, -0.155, p.z]} receiveShadow>
            <cylinderGeometry args={[0.42, 0.46, 0.31, 24]} />
            <meshStandardMaterial color={colorFor(i)} roughness={0.6} metalness={0.05} />
          </mesh>
        );
      })}
      <instancedMesh ref={blobsRef} args={[undefined, undefined, 4]} renderOrder={2}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={blobTexture} transparent depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
