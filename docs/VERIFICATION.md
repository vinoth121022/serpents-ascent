# Acceptance Gate Verification

Environment: macOS (Apple Silicon), Node 25.9, Chrome-based preview harness, Vite dev + production build.
Because the verification harness runs the page **hidden** (no rAF), time-based behavior was driven
through the real engine via `window.__sl_debug` (dev-only): `pumpFrames`/`pumpRolls` advance r3f
frames with a fixed 1/60 s delta — the identical `useFrame` path (physics, choreographer, camera,
FSM callbacks) used at runtime, minus the browser's frame scheduler.

## Gate 1 — build / lint / tests
- `npm run build` → clean (`tsc --noEmit` + `vite build`, ~4 s, 3.34 MB bundle / 1.16 MB gzip).
- `npm run lint` → zero errors, zero warnings (`--max-warnings 0`).
- `npm test` → **69/69 passed**, coverage on `src/core/**`: **100% statements / 100% branches /
  100% functions / 100% lines** (enforced as vitest thresholds — the suite fails below 100%).

## Gate 2 — core boundary
- ESLint `no-restricted-imports` rule on `src/core/**` + `npm run verify:boundaries` (grep-based,
  CI-friendly) → `boundaries OK: src/core is framework-free`. Zero imports of
  three/react/@react-three/zustand anywhere in `core/`.

## Gate 3 — scripted seeded game, core vs app
`seed=42`, 2 players, classic rules; rolls consumed from the seeded PRNG.
- Pure core (`simulateGame`, vitest): `{ phase: WIN, winner: 0, cells: [100, 27], turnNumber: 46, rng: 2647648816, logLength: 144 }` (golden-pinned in `simulate.test.ts`).
- Running app (store dispatch chain `roll → onDiceSettled → onTokenArrived → onJumpResolved`,
  instant mode): **identical snapshot** (`gate3match: true`, also asserted in `store.test.tsx`).

## Gate 4 — first-impression checklist (§1)
1. **Intro cinematic** — camera eases from the high establishing shot (r=21.5, polar 20°, azimuth −38°)
   to the default play angle (r=14, polar 55°, azimuth 0°) over 2.5 s, cubic ease, skippable on
   pointer/key/wheel. Verified by camera telemetry: position lands at exactly (0, 8.03, 11.47), dist 14.
2. **Board materiality** — beveled instanced tiles, raised frame with brass/emissive inlay, solid slab,
   table disc, ContactShadows grounding, IBL specular from procedural Lightformers. (Screenshots.)
3. **Physical snakes & ladders** — tapered spline tubes with heads/eyes/tongues, instanced rail/rung
   ladders, all casting real shadows from the key light.
4. **Idle life** — die bobs in its tray while awaiting a roll, ~48 dust motes drift in the key-light
   shaft, snakes breathe at 0.4 Hz (group scale pulse).

## Gate 5 — full game playable (seed-42 trace)
Event-counted trace of the gate-3 game (144 events): 46 ROLLED / 46 MOVED / 5 JUMPED /
5 EXTRA_TURN / 40 TURN_PASSED / 1 WON. Highlights from the log:
- Turn 1: P1 rolled 4 → moved 0→4 → **climbed ladder 4→14**.
- Turn 3: P1 rolled 6 → moved 14→20 → **extra turn** → rolled 5 → 20→25.
- Final: P1 rolled 6 at 94 → path [95..100] → **exact-roll win**.
Bounce-back, six-forfeit, capture, and rule-flag combinations are covered by 69 unit tests
(`fsm.test.ts` walks every branch); 2–4-player rotation verified in `turn rotation` test and a
4-player capture simulation. The animated path (hops, ladder climb, snake slide with vignette
pulse, win confetti + hero orbit + modal) verified visually via `playToWin` (scripted 31-turn game).

## Gate 6 — camera clamps
Polar clamped [15°, 80°] (board underside unreachable), dolly [6, 22], pan target clamped to
radius 4 / y ∈ [−0.5, 1.5] every frame, damping 0.05. Reset View (button / R / double-click)
springs to the default pose in 800 ms from any state — verified by telemetry after win-orbit and
portrait states.

## Gate 7 — dice determinism
50 consecutive physics rolls (real Rapier throws through the engine): **50/50 final faces matched
the core/ predetermined value**; 42/50 required the ~220 ms settle-velocity reconciliation slerp
(8 landed naturally on the right face). Dev-mode `console.assert` guards every roll; the rolling
log lives at `__sl_debug.stats().diceLog`.

## Gate 8 — themes
Heritage Walnut and Mystic Realm both complete (tiles, frame, inlay/emissive runes, table, snakes,
ladders, tokens, die, tray, lighting tints, number ink) and switch at runtime from Settings with
no reload (verified by screenshot pair + pixel sampling).

## Gate 9 — performance
Measured per-frame with `info.autoReset` disabled (captures all composer passes), 1600×1000 buffer:

| Tier   | Draw calls | Triangles | Headless engine+render throughput |
|--------|-----------:|----------:|-----------------------------------:|
| high   | 119        | 130,798   | ~184 fps |
| medium | 102        | 130,789   | ~174 fps |
| low    | 81         | 75,925    | ~196 fps |

Budgets met: ≤120 draw calls, ≤350k triangles. Throughput (full JS frame + GL submission, wall
clock) comfortably clears 60 FPS on this hardware; auto-tiering drops tiers at median <50/<28 FPS
on weaker devices and is disabled while the tab is hidden (throttled rAF is not a real signal).
Particles are pooled (zero per-frame allocation); tab-hidden suspends the frameloop entirely.

## Gate 10 — responsive layouts
- 1920×1080 and 1280×800 (landscape): HUD right rail; tray right of board; default camera r=14.
- 390×844 (portrait): HUD bottom sheet, tray below the board, aspect-aware camera (r→22, polar 47°)
  frames the full board. All hit targets ≥44 px. Screenshots captured for all three.

## Gate 11 — docs
`docs/ARCHITECTURE.md` (layer map, iron rule, state flow, render pipeline, future-proofing) and
`docs/DECISIONS.md` (28 entries) reflect the shipped code; this file completes the set.
