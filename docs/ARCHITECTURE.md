# Serpent's Ascent — Architecture

A premium 3D Snake & Ladder platform. One sentence: **`core/` decides, `engine/` shows, `ui/` reports, `store/` carries the signals.**

## Layer map

```
src/
  core/            PURE TypeScript. Zero imports from react/three/zustand (ESLint rule
                   + scripts/check-boundaries.mjs enforce this). The game itself.
    rng/           mulberry32 seeded PRNG; RNG state lives INSIDE GameState (serializable).
    rules/         cell↔grid↔world math, move resolution (bounce/exact-win), jump lookup,
                   dice face math (pure quaternion helpers, used by engine reconciliation).
    boards/        BoardDefinition (declarative JSON-shaped data) + validation invariants.
    state/         GameState, FSM reducers (pure: state in → state out), GameEvent log,
                   event formatting, full-game simulation helper.
  engine/          @react-three/fiber rendering. READS core state; never decides outcomes.
    board/         instanced tiles, baked number overlay, frame, table.
    creatures/     procedural snakes (tapered spline tubes) and ladders (instanced rails/rungs).
    pieces/        lathe pawn tokens + the movement Choreographer (RAF timeline).
    dice/          Rapier physics die + outcome reconciliation (physics is theater).
    camera/        orbit rig with clamps, intro cinematic, reset, auto-framing, win orbit.
    fx/            pooled instanced particles, post-processing chain.
    perf/          FPS sampling, auto quality tiering, renderer.info exposure, and the
                   manual frame bridge (mounted OUTSIDE Suspense so headless/CI pumping
                   works while assets load).
    theme/         Theme interface + Heritage Walnut / Mystic Realm palettes.
  ui/              2D HUD (DOM): roll button, turn indicator, turn log, settings, modals.
    sound/         SoundBus — procedural WebAudio blips, no samples.
  store/           Zustand slices bridging core ↔ engine ↔ ui (gameSlice, cameraSlice,
                   settingsSlice) + dev debug hooks (window.__sl_debug).
  app/             composition root (Canvas + Scene + Hud).
```

## The iron rule

`core/` compiles and its tests pass with Three.js uninstalled. Game outcomes (rolls, paths,
jumps, wins) are decided entirely by `core/` reducers; the engine merely *visualizes decisions
already made*. The dice are the canonical example: the PRNG draws the result first, then the
physics die is thrown as theater and nudged (imperceptibly, at settle velocity) onto the
predetermined face.

## State flow

```
 user input            zustand store                core/ (pure)
┌──────────┐  roll()  ┌─────────────┐ startRoll(s) ┌──────────────┐
│ HUD/keys ├─────────►│  gameSlice  ├─────────────►│ FSM reducers │
└──────────┘          │  (dispatch) │◄─────────────┤  state'+log  │
                      └──────┬──────┘   GameState  └──────────────┘
                             │ subscribe (phase changes)
              ┌──────────────┼─────────────────┐
              ▼              ▼                 ▼
        DiceSystem     Choreographer      HUD (react)
        (physics +     (token hops,       turn log, buttons,
         reconcile)     jump anims)       modals, vignette
              │              │
              └──── completion callbacks ──► store.onDiceSettled()/onTokenArrived()/...
                    (animations report back; core never setTimeouts around guesses)
```

FSM (in `core/state/fsm.ts`):
```
AWAITING_ROLL → DICE_ROLLING → TOKEN_MOVING → RESOLVING_JUMP? → CHECK_WIN → (WIN | NEXT_TURN → AWAITING_ROLL)
```
Transitions are explicit functions; illegal transitions **throw** in strict mode (tests, dev)
and no-op with `console.error` in prod (`setStrictMode`).

## Render pipeline

1. r3f Canvas (`frameloop` suspended when tab hidden), dpr clamped [1, 2] by tier.
2. Lights: warm directional key (shadow-casting, frustum fitted to board), cool hemisphere
   fill, procedural Lightformer environment for IBL specular (no network fetches).
3. Static geometry: 1 instanced tile mesh + 1 number-overlay plane + frame + table;
   creatures merged/instanced (snake tubes share one vertex-colored geometry; ladder rails
   and rungs are two InstancedMeshes). Steady-state draw calls ≈ 25–40 — far under the 120 budget.
4. Dynamic: tokens (4 lathe pawns) moved imperatively by the Choreographer (refs, no
   per-frame React state), physics die, pooled particle systems (zero per-frame allocation).
5. Post (tier-gated): Bloom (high threshold) + Vignette + SMAA on high; SMAA on medium; none on low.

## Future-proofing (design-for, don't build)

- **Online multiplayer:** `core/` runs server-side verbatim; `GameState.log` (typed
  `GameEvent[]`) *is* the wire protocol. Clients consume the event stream and feed it to the
  same choreographer. RNG state is in GameState, so the server is authoritative for free.
- **AI opponents:** an agent is a roll-trigger policy — it calls `roll()` when
  `phase === AWAITING_ROLL && current === botIndex`. No core changes.
- **Custom boards:** `BoardDefinition` is data; validation runs on load. New JSON = new board.
- **Skins:** materials resolve through the `Theme` interface; a third theme is a palette file.
- **Replay:** `seed + rollScript (or event log)` reproduces a full game — `simulateGame` already
  does this headlessly; the engine can play any event stream at any speed.
- **Spectator:** a read-only event-stream consumer — same path as multiplayer minus input.
