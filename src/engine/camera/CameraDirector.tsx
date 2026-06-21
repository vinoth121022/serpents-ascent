import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Spherical, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useStore } from '../../store';
import { registry } from '../registry';

const DEG = Math.PI / 180;

/** Spec §5 numbers. */
const POLAR_MIN = 15 * DEG;
const POLAR_MAX = 70 * DEG; // max tilt — never crosses under the table
// Overview azimuth confined to a 120° arc, ±60° off the board's front face.
const AZIMUTH_MIN = -60 * DEG;
const AZIMUTH_MAX = 60 * DEG;
const DIST_MIN = 6;
const DIST_MAX = 22;
const PAN_RADIUS = 4;
const INTRO_FROM = new Spherical(21.5, 20 * DEG, -38 * DEG);
const INTRO_SECONDS = 2.5;
const RESET_SECONDS = 0.8;

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Mode = 'intro' | 'user' | 'reset' | 'win';

interface Glide {
  fromS: Spherical;
  toS: Spherical;
  fromT: Vector3;
  toT: Vector3;
  t: number;
  seconds: number;
}

const tmpV = new Vector3();
const tmpS = new Spherical();

/**
 * The camera rig: clamped orbit + one-time intro cinematic + Reset View spring +
 * subtle auto-framing of moving tokens + winner hero orbit. Zero hard cuts.
 */
export function CameraDirector() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / s.size.height);
  // Narrow (portrait) viewports need a longer default distance to frame the board.
  const DEFAULT_VIEW = useMemo(
    () =>
      new Spherical(
        Math.min(DIST_MAX, 14 / Math.min(1, aspect * 1.1)),
        (aspect < 1 ? 47 : 55) * DEG, // portrait: a touch more top-down to fit the width
        0,
      ),
    [aspect],
  );
  const mode = useRef<Mode>('intro');
  const glide = useRef<Glide | null>(null);
  const introT = useRef(0);
  const winTheta = useRef(0);

  // Apply the intro start pose immediately so frame 1 is the establishing shot.
  useEffect(() => {
    camera.position.setFromSpherical(INTRO_FROM);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  // Skip the intro on any input.
  useEffect(() => {
    const skip = (): void => {
      if (mode.current === 'intro') introT.current = INTRO_SECONDS;
    };
    window.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    window.addEventListener('wheel', skip);
    return () => {
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('wheel', skip);
    };
  }, []);

  const beginGlide = useCallback(
    (toS: Spherical, toT: Vector3, seconds: number): void => {
      const controls = controlsRef.current;
      const target = controls !== null ? controls.target.clone() : new Vector3();
      tmpV.copy(camera.position).sub(target);
      glide.current = {
        fromS: new Spherical().setFromVector3(tmpV),
        toS: toS.clone(),
        fromT: target,
        toT: toT.clone(),
        t: 0,
        seconds,
      };
    },
    [camera],
  );

  // Reset View requests (HUD button, R key, double-click).
  useEffect(
    () =>
      useStore.subscribe((state, prev) => {
        if (state.resetViewId !== prev.resetViewId && mode.current !== 'intro') {
          beginGlide(DEFAULT_VIEW, new Vector3(0, 0, 0), RESET_SECONDS);
          mode.current = 'reset';
        }
        // Leaving WIN (new game) → glide home.
        if (prev.game.phase === 'WIN' && state.game.phase !== 'WIN') {
          beginGlide(DEFAULT_VIEW, new Vector3(0, 0, 0), RESET_SECONDS);
          mode.current = 'reset';
        }
      }),
    [beginGlide, DEFAULT_VIEW],
  );

  useFrame((_, dt) => {
    const controls = controlsRef.current;
    if (controls === null) return;
    const { game, introDone, finishIntro } = useStore.getState();

    // --- intro cinematic ---
    if (mode.current === 'intro') {
      controls.enabled = false;
      introT.current = Math.min(introT.current + dt, INTRO_SECONDS);
      const t = easeInOutCubic(introT.current / INTRO_SECONDS);
      tmpS.set(
        INTRO_FROM.radius + (DEFAULT_VIEW.radius - INTRO_FROM.radius) * t,
        INTRO_FROM.phi + (DEFAULT_VIEW.phi - INTRO_FROM.phi) * t,
        INTRO_FROM.theta + (DEFAULT_VIEW.theta - INTRO_FROM.theta) * t,
      );
      camera.position.setFromSpherical(tmpS);
      camera.lookAt(0, 0, 0);
      if (introT.current >= INTRO_SECONDS) {
        mode.current = 'user';
        controls.enabled = true;
        controls.target.set(0, 0, 0);
        if (!introDone) finishIntro();
      }
      return;
    }

    // --- win hero orbit ---
    if (game.phase === 'WIN') {
      const winnerToken = registry.tokens[game.winner ?? 0];
      const focus = winnerToken !== null && winnerToken !== undefined ? winnerToken.position : tmpV.set(0, 0, 0);
      if (mode.current !== 'win') {
        mode.current = 'win';
        controls.enabled = false;
        tmpV.copy(camera.position).sub(focus);
        winTheta.current = new Spherical().setFromVector3(tmpV).theta;
        beginGlide(new Spherical(7.5, 60 * DEG, winTheta.current), focus.clone().setY(0.3), RESET_SECONDS);
      }
      const g = glide.current;
      if (g !== null) {
        runGlide(g, dt, controls);
        if (g.t >= g.seconds) glide.current = null;
      } else {
        winTheta.current += dt * 0.35;
        tmpS.set(7.5, 60 * DEG, winTheta.current);
        controls.target.lerp(tmpV.set(focus.x, 0.3, focus.z), 0.08);
        camera.position.setFromSpherical(tmpS).add(controls.target);
        camera.lookAt(controls.target);
      }
      return;
    } else if (mode.current === 'win') {
      // WIN exited without a phase-change glide (shouldn't happen) — recover.
      mode.current = 'user';
      controls.enabled = true;
    }

    // --- reset / programmatic glide ---
    if (mode.current === 'reset') {
      const g = glide.current;
      controls.enabled = false;
      if (g !== null) {
        runGlide(g, dt, controls);
        if (g.t >= g.seconds) {
          glide.current = null;
          mode.current = 'user';
          controls.enabled = true;
        }
      } else {
        mode.current = 'user';
        controls.enabled = true;
      }
      return;
    }

    // --- user mode: clamps + phase-driven camera focus ---
    const target = controls.target;

    if (!registry.userDragging && game.phase === 'DICE_ROLLING' && registry.diceTrayPos !== null) {
      // Focus on the rolling die (front tray, outside the normal pan radius).
      target.lerp(registry.diceTrayPos, Math.min(1, dt * 2));
    } else if (
      !registry.userDragging &&
      (game.phase === 'TOKEN_MOVING' || game.phase === 'RESOLVING_JUMP')
    ) {
      // Slowly follow the moving toy across the board.
      const token = registry.tokens[game.current];
      if (token !== null && token !== undefined) {
        tmpV.set(token.position.x, 0, token.position.z);
        target.lerp(tmpV, Math.min(1, dt * 1.4));
      }
    } else {
      // Between turns / free look: clamp the pan, then ease back to the board center.
      const flat = Math.hypot(target.x, target.z);
      if (flat > PAN_RADIUS) {
        const k = PAN_RADIUS / flat;
        target.x *= k;
        target.z *= k;
      }
      target.y = Math.max(-0.5, Math.min(1.5, target.y));
      if (!registry.userDragging) target.lerp(tmpV.set(0, 0, 0), Math.min(1, dt * 1.4));
    }

    controls.update();
  });

  function runGlide(g: Glide, dt: number, controls: OrbitControlsImpl): void {
    g.t = Math.min(g.t + dt, g.seconds);
    const t = easeInOutCubic(g.t / g.seconds);
    tmpS.set(
      g.fromS.radius + (g.toS.radius - g.fromS.radius) * t,
      g.fromS.phi + (g.toS.phi - g.fromS.phi) * t,
      g.fromS.theta + (g.toS.theta - g.fromS.theta) * t,
    );
    controls.target.lerpVectors(g.fromT, g.toT, t);
    camera.position.setFromSpherical(tmpS).add(controls.target);
    camera.lookAt(controls.target);
  }

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.05}
      rotateSpeed={0.85}
      zoomSpeed={0.6}
      panSpeed={0.8}
      screenSpacePanning
      minDistance={DIST_MIN}
      maxDistance={DIST_MAX}
      minPolarAngle={POLAR_MIN}
      maxPolarAngle={POLAR_MAX}
      minAzimuthAngle={AZIMUTH_MIN}
      maxAzimuthAngle={AZIMUTH_MAX}
      onStart={() => {
        registry.userDragging = true;
      }}
      onEnd={() => {
        registry.userDragging = false;
      }}
    />
  );
}
