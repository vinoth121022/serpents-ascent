import { type PerspectiveCamera, Vector3 } from 'three';
import { simulateGame, snapshot } from '../core';
import { medianFps, registry } from '../engine/registry';
import { useStore } from './index';

/**
 * Dev-only verification hooks (window.__sl_debug) used by the acceptance gates:
 *  - runScriptedGame: gate 3 — same final state through the app's dispatch path
 *    as the pure core/ simulation.
 *  - autoRoll: gate 7 — N real physics rolls, every one reconciled to core's value.
 *  - stats: gate 9 — FPS / draw calls / triangles at the current tier.
 */
export function installDebug(): void {
  if (!import.meta.env.DEV) return;

  let frozenDelta: (() => number) | null = null;

  const api = {
    store: useStore,

    /** Halt time: every useFrame dt becomes 0, freezing animation mid-pose for a screenshot. */
    freeze(): string {
      const clock = registry.r3f?.clock;
      if (!clock) return 'no clock';
      if (frozenDelta === null) frozenDelta = clock.getDelta.bind(clock);
      (clock as { getDelta: () => number }).getDelta = () => 0;
      return 'frozen';
    },

    /** Resume time after a freeze(). */
    unfreeze(): string {
      const clock = registry.r3f?.clock;
      if (!clock || frozenDelta === null) return 'not frozen';
      (clock as { getDelta: () => number }).getDelta = frozenDelta;
      frozenDelta = null;
      return 'resumed';
    },

    /** Reposition the camera for close-up diagnostics (free mode preserves the pose). */
    moveCamera(px: number, py: number, pz: number): string {
      const cam = registry.r3f?.camera;
      if (!cam) return 'no camera';
      cam.position.set(px, py, pz);
      return 'moved';
    },

    /** Live choreographer movement state (diagnostics). */
    probe(): { movingToken: number | null; movementMode: string | null; tokenY: (number | null)[] } {
      return {
        movingToken: registry.movingToken,
        movementMode: registry.movementMode,
        tokenY: registry.tokens.map((t) => (t ? Math.round(t.position.y * 100) / 100 : null)),
      };
    },

    /** Project a world point to canvas screen px via the live camera (offset-aware). */
    screenOf(x: number, y: number, z: number): { x: number; y: number } | string {
      const cam = registry.r3f?.camera as unknown as PerspectiveCamera | undefined;
      const gl = registry.gl;
      if (!cam || !gl) return 'no camera/gl';
      const v = new Vector3(x, y, z).project(cam);
      const rect = gl.domElement.getBoundingClientRect();
      return { x: (v.x * 0.5 + 0.5) * rect.width + rect.left, y: (-v.y * 0.5 + 0.5) * rect.height + rect.top };
    },

    /** Render one frame and sample pixels at canvas-relative (0..1) coords (diagnostics). */
    samplePixel(u: number, v: number): number[] | string {
      const r3f = registry.r3f;
      const gl = registry.gl;
      if (r3f === null || gl === null) return 'no bridge';
      r3f.advance(performance.now(), true);
      const src = gl.domElement;
      const probe = document.createElement('canvas');
      probe.width = 4;
      probe.height = 4;
      const ctx = probe.getContext('2d');
      if (ctx === null) return 'no 2d';
      ctx.drawImage(src, u * src.width - 2, v * src.height - 2, 4, 4, 0, 0, 4, 4);
      const px = ctx.getImageData(1, 1, 1, 1).data;
      return [px[0] ?? 0, px[1] ?? 0, px[2] ?? 0];
    },

    /** Inspect vertex-colored meshes (diagnostics). */
    inspectVertexColorMeshes(): unknown[] {
      const root = registry.r3f?.scene;
      const out: unknown[] = [];
      if (root === undefined || root === null) return out;
      root.traverse((o) => {
        const mesh = o as {
          isMesh?: boolean;
          material?: { vertexColors?: boolean; color?: { r: number; g: number; b: number } };
          geometry?: { attributes?: Record<string, { count: number; array: ArrayLike<number> }> };
        };
        if (mesh.isMesh === true && mesh.material?.vertexColors === true) {
          const attrs = mesh.geometry?.attributes ?? {};
          const color = attrs['color'];
          const pos = attrs['position'];
          const m2 = mesh as unknown as { visible: boolean; renderOrder: number; parent?: { visible: boolean } };
          out.push({
            attrs: Object.keys(attrs),
            count: pos?.count ?? 0,
            firstVertex: pos !== undefined ? [pos.array[0], pos.array[1], pos.array[2]] : null,
            colorSample: color !== undefined ? [color.array[0], color.array[1], color.array[2]] : null,
            visible: m2.visible,
            parentVisible: m2.parent?.visible ?? null,
            renderOrder: m2.renderOrder,
          });
        }
      });
      return out;
    },

    stats() {
      const gl = registry.gl;
      const cam = registry.r3f?.camera.position;
      return {
        camera: cam ? { x: Math.round(cam.x * 100) / 100, y: Math.round(cam.y * 100) / 100, z: Math.round(cam.z * 100) / 100, dist: Math.round(cam.length() * 100) / 100 } : null,
        fps: Math.round(medianFps() * 10) / 10,
        drawCalls: gl?.info.render.calls ?? null,
        triangles: gl?.info.render.triangles ?? null,
        tier: useStore.getState().resolvedTier,
        diceLog: registry.diceLog.slice(-50),
      };
    },

    /** Gate 3: run seed=42 through the store's real dispatch chain (instant mode). */
    runScriptedGame(seed = 42): unknown {
      const s = useStore.getState();
      s.setInstantMode(true);
      s.newGame({ names: ['P1', 'P2'], seed });
      let safety = 0;
      // The GameDriver/dice complete via microtasks in instant mode, but the
      // reducers themselves are synchronous — drive them directly here.
      while (useStore.getState().game.phase !== 'WIN' && safety < 20000) {
        safety += 1;
        const st = useStore.getState();
        switch (st.game.phase) {
          case 'AWAITING_ROLL':
            st.roll();
            break;
          case 'DICE_ROLLING':
            st.onDiceSettled();
            break;
          case 'TOKEN_MOVING':
            st.onTokenArrived();
            break;
          case 'RESOLVING_JUMP':
            st.onJumpResolved();
            break;
          default:
            safety = 20000;
        }
      }
      const result = snapshot(useStore.getState().game);
      useStore.getState().setInstantMode(false);
      return result;
    },

    /** The same game computed purely in core/ — must equal runScriptedGame(seed). */
    pureCoreGame(seed = 42): unknown {
      return snapshot(simulateGame({ playerNames: ['P1', 'P2'], seed }));
    },

    /**
     * Gate 7, headless variant: pump fixed-dt frames through the REAL engine
     * (r3f advance → physics step → choreographer → FSM) with no rAF needed.
     * Microtask yields between frames let completion callbacks fire.
     */
    async pumpRolls(n = 50): Promise<{ total: number; matched: number; corrected: number; frames: number }> {
      const r3f = registry.r3f;
      if (r3f === null) throw new Error('r3f bridge not mounted');
      const clock = r3f.clock;
      const originalGetDelta = clock.getDelta.bind(clock);
      (clock as { getDelta: () => number }).getDelta = () => 1 / 60;
      // Skip actual GL draws while pumping — logic/physics/choreography still run.
      const gl = registry.gl;
      const originalRender = gl !== null ? gl.render.bind(gl) : null;
      if (gl !== null) (gl as unknown as { render: () => void }).render = () => undefined;
      registry.diceLog.length = 0;
      useStore.getState().newGame({ names: ['P1', 'P2'], seed: 1 });
      let frames = 0;
      try {
        while (registry.diceLog.length < n && frames < 120000) {
          const st = useStore.getState();
          if (st.game.phase === 'AWAITING_ROLL') st.roll();
          else if (st.game.phase === 'WIN') st.newGame({ names: ['P1', 'P2'], seed: frames + 2 });
          r3f.advance(performance.now(), true);
          frames += 1;
          await Promise.resolve(); // flush queueMicrotask completions
        }
      } finally {
        (clock as { getDelta: () => number }).getDelta = originalGetDelta;
        if (gl !== null && originalRender !== null) (gl as unknown as { render: typeof originalRender }).render = originalRender;
      }
      const entries = registry.diceLog.slice(0, n);
      return {
        total: entries.length,
        matched: entries.filter((e) => e.ok).length,
        corrected: entries.filter((e) => e.corrected).length,
        frames,
      };
    },

    /** Headless frame pump for screenshots/perf: advance N fixed frames. */
    async pumpFrames(n = 60): Promise<void> {
      const r3f = registry.r3f;
      if (r3f === null) throw new Error('r3f bridge not mounted');
      const clock = r3f.clock;
      const originalGetDelta = clock.getDelta.bind(clock);
      (clock as { getDelta: () => number }).getDelta = () => 1 / 60;
      try {
        for (let i = 0; i < n; i++) {
          r3f.advance(performance.now(), true);
          await Promise.resolve();
        }
      } finally {
        (clock as { getDelta: () => number }).getDelta = originalGetDelta;
      }
    },

    /** Gate 9: true per-frame draw calls/triangles (info.autoReset hides passes). */
    async measureFrame(): Promise<{ drawCalls: number; triangles: number } | null> {
      const r3f = registry.r3f;
      const gl = registry.gl;
      if (r3f === null || gl === null) return null;
      gl.info.autoReset = false;
      gl.info.reset();
      r3f.advance(performance.now(), true);
      await Promise.resolve();
      const out = { drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles };
      gl.info.autoReset = true;
      return out;
    },

    /** Wall-clock throughput of the full engine+render loop (headless FPS proxy). */
    async measureThroughput(frames = 240): Promise<{ fps: number }> {
      const r3f = registry.r3f;
      if (r3f === null) throw new Error('r3f bridge not mounted');
      const clock = r3f.clock;
      const originalGetDelta = clock.getDelta.bind(clock);
      (clock as { getDelta: () => number }).getDelta = () => 1 / 60;
      const t0 = performance.now();
      try {
        for (let i = 0; i < frames; i++) {
          r3f.advance(performance.now(), true);
          await Promise.resolve();
        }
      } finally {
        (clock as { getDelta: () => number }).getDelta = originalGetDelta;
      }
      const seconds = (performance.now() - t0) / 1000;
      return { fps: Math.round((frames / seconds) * 10) / 10 };
    },

    /** Gates 4/5: play a (scripted) game to the WIN sequence with real animations. */
    async playToWin(rollScript?: number[], seed = 9): Promise<{ phase: string; winner: number | null; frames: number }> {
      const r3f = registry.r3f;
      if (r3f === null) throw new Error('r3f bridge not mounted');
      const clock = r3f.clock;
      const originalGetDelta = clock.getDelta.bind(clock);
      (clock as { getDelta: () => number }).getDelta = () => 1 / 60;
      const gl = registry.gl;
      const originalRender = gl !== null ? gl.render.bind(gl) : null;
      if (gl !== null) (gl as unknown as { render: () => void }).render = () => undefined;
      useStore.getState().newGame({ names: ['Asha', 'Ravi'], seed, rollScript });
      let frames = 0;
      try {
        while (useStore.getState().game.phase !== 'WIN' && frames < 120000) {
          const st = useStore.getState();
          if (st.game.phase === 'AWAITING_ROLL') st.roll();
          r3f.advance(performance.now(), true);
          frames += 1;
          await Promise.resolve();
        }
      } finally {
        (clock as { getDelta: () => number }).getDelta = originalGetDelta;
        if (gl !== null && originalRender !== null) (gl as unknown as { render: typeof originalRender }).render = originalRender;
      }
      // Let the win sequence (confetti burst, hero orbit, modal delay) play rendered.
      for (let i = 0; i < 120; i++) {
        r3f.advance(performance.now(), true);
        await Promise.resolve();
      }
      const g = useStore.getState().game;
      return { phase: g.phase, winner: g.winner, frames };
    },

    /** Gate 7: fire N real physics rolls back to back; returns the match record. */
    autoRoll(n = 50): Promise<{ total: number; matched: number; entries: typeof registry.diceLog }> {
      registry.diceLog.length = 0;
      return new Promise((resolve) => {
        const tick = (): void => {
          const st = useStore.getState();
          if (registry.diceLog.length >= n) {
            const entries = registry.diceLog.slice(0, n);
            resolve({ total: entries.length, matched: entries.filter((e) => e.ok).length, entries });
            return;
          }
          if (st.game.phase === 'AWAITING_ROLL') {
            st.roll();
          } else if (st.game.phase === 'WIN') {
            st.newGame({ names: ['P1', 'P2'], seed: Math.floor(Math.random() * 0x7fffffff) });
          }
          setTimeout(tick, 120);
        };
        tick();
      });
    },
  };

  (window as unknown as { __sl_debug: typeof api }).__sl_debug = api;
}
