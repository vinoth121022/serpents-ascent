import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect } from 'react';
import { PerfMonitor } from '../engine/perf/PerfMonitor';
import { Scene } from '../engine/Scene';
import { installDebug } from '../store/debug';
import { useStore } from '../store';
import { Hud } from '../ui/Hud';

const DPR: Record<string, [number, number]> = {
  high: [1, 2],
  medium: [1, 1.75],
  low: [1, 1.25],
};

export function App() {
  const tier = useStore((s) => s.resolvedTier);
  const hidden = useStore((s) => s.hidden);

  // Tab hidden → suspend the render loop entirely (spec §10).
  useEffect(() => {
    installDebug();
    const onVisibility = (): void => {
      useStore.getState().setHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        shadows={tier !== 'low'}
        dpr={DPR[tier] ?? [1, 2]}
        frameloop={hidden ? 'never' : 'always'}
        camera={{ fov: 45, near: 0.1, far: 200, position: [0, 14, 16] }}
        gl={{ antialias: tier !== 'high', powerPreference: 'high-performance' }}
      >
        {/* Outside Suspense: the frame bridge / perf sampling must exist even while assets load. */}
        <PerfMonitor />
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      <Hud />
    </div>
  );
}
