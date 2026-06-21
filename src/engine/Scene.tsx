import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { Suspense, useMemo } from 'react';
import { useStore } from '../store';
import { Board } from './board/Board';
import { CameraDirector } from './camera/CameraDirector';
import { Ladders } from './creatures/Ladders';
import { Snakes } from './creatures/Snakes';
import { DiceSystem } from './dice/DiceSystem';
import { Effects } from './fx/Effects';
import { GameDriver } from './GameDriver';
import { ParticleFX } from './fx/ParticleFX';
import { Choreographer } from './pieces/choreographer';
import { Tokens } from './pieces/Tokens';
import { THEMES } from './theme/themes';

export function Scene() {
  const themeId = useStore((s) => s.theme);
  const tier = useStore((s) => s.resolvedTier);
  const board = useStore((s) => s.game.board);
  const theme = THEMES[themeId];
  const choreographer = useMemo(() => new Choreographer(), []);

  const shadowSize = tier === 'high' ? 2048 : 1024;

  return (
    <>
      <color attach="background" args={[theme.background]} />

      {/* Key: warm directional, frustum fitted to board + tray (spec §6) */}
      <directionalLight
        key={`key-${tier}`}
        position={[7, 11, 6]}
        intensity={2.2}
        color={theme.keyLight}
        castShadow={tier !== 'low'}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-camera-near={2}
        shadow-camera-far={32}
        shadow-bias={-0.0002}
        shadow-normalBias={0.04}
      />
      {/* Cool fill against the warm key — lifted enough that curved flanks keep their hue */}
      <hemisphereLight args={[theme.fillSky, theme.fillGround, 0.6]} />

      {/* Procedural IBL — no network fetches (DECISIONS.md #7) */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#0b0907']} />
        <Lightformer form="rect" intensity={2.6} color={theme.keyLight} position={[6, 7, 4]} scale={[8, 6, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.1} color={theme.fillSky} position={[-7, 4, -5]} scale={[10, 5, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={0.7} color="#ffffff" position={[0, 9, -7]} scale={[12, 12, 1]} target={[0, 0, 0]} />
      </Environment>

      {/* Static soft grounding on the table (frames=1 — DECISIONS.md #6) */}
      <ContactShadows position={[0, -0.3, 0]} opacity={0.5} scale={26} blur={2.4} far={1.4} resolution={512} frames={1} color="#000000" />

      <Board theme={theme} />
      <Snakes board={board} theme={theme} />
      <Ladders board={board} theme={theme} />
      <Tokens theme={theme} choreographer={choreographer} />
      {/* Only the physics subtree suspends on the rapier WASM — the board never waits. */}
      <Suspense fallback={null}>
        <DiceSystem theme={theme} />
      </Suspense>
      <ParticleFX theme={theme} />

      <GameDriver choreographer={choreographer} />
      <CameraDirector />
      <Effects tier={tier} />
    </>
  );
}
