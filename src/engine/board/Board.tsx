import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Color, ExtrudeGeometry, InstancedMesh, Matrix4, Shape, ShapeGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { cellToGrid, cellToWorld } from '../../core';
import { useStore, type BoardStyle } from '../../store';
import type { Theme } from '../theme/themes';
import { makeNumbersTexture } from './numbersTexture';
import { makeWoodTexture } from './woodTexture';

const TILE = { size: 0.94, height: 0.06, bevel: 0.012 };
// In wood mode the tile tint multiplies the grain map — keep it bright so the
// grain reads (a near-white / light pair gives alternating light & dark planks).
const WOOD_TINT_A = '#ffffff';
const WOOD_TINT_B = '#d8b88a';

/** 100 beveled tiles in ONE InstancedMesh; alternation via per-instance color. */
function Tiles({
  theme,
  boardStyle,
  boardColors,
}: {
  theme: Theme;
  boardStyle: BoardStyle;
  boardColors: [string, string];
}) {
  const ref = useRef<InstancedMesh>(null);
  const gl = useThree((s) => s.gl);
  const geometry = useMemo(
    () => new RoundedBoxGeometry(TILE.size, TILE.height, TILE.size, 2, TILE.bevel),
    [],
  );

  // Procedural wood map (built once); the per-instance tile colors tint it,
  // giving an alternating light/dark stained-plank board in 'wood' mode.
  const wood = useMemo(() => {
    const t = makeWoodTexture();
    t.anisotropy = gl.capabilities.getMaxAnisotropy();
    return t;
  }, [gl]);
  useEffect(() => () => wood.dispose(), [wood]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (mesh === null) return;
    const m = new Matrix4();
    const c = new Color();
    for (let n = 1; n <= 100; n++) {
      const { row, col } = cellToGrid(n);
      const { x, z } = cellToWorld(n);
      m.setPosition(x, -TILE.height / 2, z); // tile tops at y = 0 (spec §4)
      mesh.setMatrixAt(n - 1, m);
      const light = (row + col) % 2 === 0;
      if (boardStyle === 'wood') c.set(light ? WOOD_TINT_A : WOOD_TINT_B);
      else c.set(light ? boardColors[0] : boardColors[1]);
      mesh.setColorAt(n - 1, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  }, [theme, boardStyle, boardColors]);

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, 100]} receiveShadow castShadow>
      {/* key forces a fresh material per mode so the USE_MAP shader define is
          (re)compiled — toggling map between null and a texture in place won't. */}
      <meshStandardMaterial
        key={boardStyle}
        roughness={theme.tileRoughness}
        metalness={theme.tileMetalness}
        map={boardStyle === 'wood' ? wood : null}
      />
    </instancedMesh>
  );
}

function NumbersOverlay({ theme }: { theme: Theme }) {
  const texture = useMemo(() => makeNumbersTexture(theme), [theme]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} renderOrder={1}>
      <planeGeometry args={[10, 10]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  );
}

function roundedRect(half: number, radius: number): Shape {
  const s = new Shape();
  s.moveTo(-half + radius, -half);
  s.lineTo(half - radius, -half);
  s.absarc(half - radius, -half + radius, radius, -Math.PI / 2, 0, false);
  s.lineTo(half, half - radius);
  s.absarc(half - radius, half - radius, radius, 0, Math.PI / 2, false);
  s.lineTo(-half + radius, half);
  s.absarc(-half + radius, half - radius, radius, Math.PI / 2, Math.PI, false);
  s.lineTo(-half, -half + radius);
  s.absarc(-half + radius, -half + radius, radius, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Raised decorative frame around the play surface, with a contrasting inlay ring on top. */
function Frame({ theme }: { theme: Theme }) {
  const frameGeometry = useMemo(() => {
    const outer = roundedRect(5.7, 0.5);
    const hole = roundedRect(5.06, 0.1);
    outer.holes.push(hole);
    const g = new ExtrudeGeometry(outer, {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    g.rotateX(-Math.PI / 2); // extrude up
    return g;
  }, []);

  const inlayGeometry = useMemo(() => {
    const outer = roundedRect(5.48, 0.42);
    const hole = roundedRect(5.24, 0.34);
    outer.holes.push(hole);
    const g = new ShapeGeometry(outer, 24);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  return (
    <group>
      <mesh geometry={frameGeometry} position={[0, -0.06, 0]} castShadow receiveShadow>
        <meshStandardMaterial
          color={theme.frame.color}
          roughness={theme.frame.roughness}
          metalness={theme.frame.metalness}
        />
      </mesh>
      <mesh geometry={inlayGeometry} position={[0, 0.145, 0]}>
        <meshStandardMaterial
          color={theme.inlay.color}
          roughness={theme.inlay.roughness}
          metalness={theme.inlay.metalness}
          emissive={theme.inlay.emissive ?? '#000000'}
          emissiveIntensity={theme.inlay.emissiveIntensity ?? 0}
        />
      </mesh>
    </group>
  );
}

export function Board({ theme }: { theme: Theme }) {
  const boardStyle = useStore((s) => s.boardStyle);
  const tableColor = useStore((s) => s.tableColor);
  const boardColors = useStore((s) => s.boardColors);

  return (
    <group>
      <Tiles theme={theme} boardStyle={boardStyle} boardColors={boardColors} />
      <NumbersOverlay theme={theme} />
      <Frame theme={theme} />
      {/* Solid slab under the tiles */}
      <mesh position={[0, -0.185, 0]} receiveShadow>
        <boxGeometry args={[11.4, 0.25, 11.4]} />
        <meshStandardMaterial
          color={theme.frame.color}
          roughness={theme.frame.roughness}
          metalness={theme.frame.metalness}
        />
      </mesh>
      {/* The table the whole set lives on — gives reflections somewhere to live */}
      <mesh position={[0, -0.485, 0]} receiveShadow>
        <cylinderGeometry args={[10.5, 10.8, 0.35, 72]} />
        <meshStandardMaterial
          color={tableColor}
          roughness={theme.table.roughness}
          metalness={theme.table.metalness}
        />
      </mesh>
    </group>
  );
}
