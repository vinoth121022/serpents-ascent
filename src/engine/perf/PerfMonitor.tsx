import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { medianFps, pushFrameTime, registry } from '../registry';

/**
 * Auto-tiering (spec §10): sample the first 5 s; median < 50 → drop a tier;
 * < 28 → drop again. Only active while quality is 'auto'. Also exposes the
 * renderer for the perf gates (draw calls / triangles via renderer.info).
 */
export function PerfMonitor() {
  const gl = useThree((s) => s.gl);
  const advance = useThree((s) => s.advance);
  const clock = useThree((s) => s.clock);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const elapsed = useRef(0);
  const phase = useRef<'sampling' | 'resample' | 'done'>('sampling');

  useEffect(() => {
    registry.gl = gl;
    registry.r3f = { advance, clock, camera, scene };
    return () => {
      registry.gl = null;
      registry.r3f = null;
    };
  }, [gl, advance, clock, camera, scene]);

  useFrame((_, dt) => {
    pushFrameTime(dt);
    if (phase.current === 'done') return;
    const { quality, resolvedTier, setResolvedTier, introDone } = useStore.getState();
    if (quality !== 'auto') {
      phase.current = 'done';
      return;
    }
    if (!introDone) return; // don't judge FPS during the intro's first paints
    if (document.hidden) return; // hidden tabs get throttled rAF — not a real signal
    elapsed.current += dt;
    if (elapsed.current < 5) return;

    const fps = medianFps();
    if (fps < 28 && resolvedTier !== 'low') {
      setResolvedTier('low');
      phase.current = 'done';
    } else if (fps < 50 && resolvedTier === 'high') {
      setResolvedTier('medium');
      elapsed.current = 0;
      phase.current = 'resample'; // one more window to decide on a second drop
    } else {
      phase.current = 'done';
    }
  });

  return null;
}
