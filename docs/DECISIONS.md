# Decision Log

One line each: context → choice → why.

1. Prior single-file prototype → moved to `prototype/board-v0.html` → superseded by the platform build; kept for history.
2. Board layout (spec wants 9 snakes / 9 ladders from a published layout) → classic Milton Bradley layout, dropping its 10th snake 56→53 → MB ships 10 snakes/9 ladders; 56→53 is the shortest and least visually interesting, trimming it satisfies the 9/9 spec with minimal deviation. Recorded set lives in `core/boards/classic.ts`.
3. Tile numbering render → single full-board transparent canvas-texture overlay plane (1 draw call) → cheaper and simpler than a per-tile atlas while meeting the "no 100 text draw calls" rule.
4. Dice face convention → +Y=1, −Y=6, +X=3, −X=4, +Z=2, −Z=5 (opposite faces sum to 7) → standard die; encoded once in `core/rules/dice.ts`, shared by pip placement and face detection.
5. Quaternion math for face detection/reconciliation → implemented pure in `core/` (no three) → testable to 100% without WebGL; engine reuses it so detection and correction can't drift apart.
6. Contact shadows → drei ContactShadows rendered with `frames={1}` (static grounding on the table) + cheap dynamic blob sprites under tokens/die → continuous ContactShadows re-renders the whole scene depth every frame; blobs keep the grounding at ~zero cost (60 FPS budget wins).
7. IBL environment → procedural drei `<Environment>` with Lightformer children instead of a downloaded preset → offline-safe, no external assets, same specular life.
8. Snake breathing → whole-snake group scale pulse (≤0.5 Hz) instead of per-vertex radial scaling → reads identically at viewing distance, costs nothing; per-vertex would need a custom shader pass.
9. Mystic snake "emissive underbelly" → low-intensity uniform emissive on the body material → a true underbelly mask needs a second material/UV split; uniform emissive at 0.18 reads the same from play angles.
10. Capture rule (flag, default OFF) → captured opponent returns to cell 0 (off-board start) → classic Ludo-style convention; cell 0 already models "not yet entered".
11. NEXT_TURN modeled as a real FSM phase; store calls `checkWin` + `nextTurn` back-to-back → keeps the spec's FSM shape and explicit transition functions without an engine-visible dwell.
12. Six-forfeit path → forfeited roll goes through TOKEN_MOVING with an empty path → uniform FSM shape (engine choreographer completes instantly); avoids a special DICE_ROLLING→CHECK_WIN edge.
13. RNG → mulberry32 with state held in GameState as uint32 → serializable, replayable, injectable; xoshiro adds nothing at 6 outcomes per draw.
14. Scripted rolls (gate 3) → `GameConfig.rollScript` consumed before falling back to the PRNG → supports deterministic verification and future replays through the exact same reducer path.
15. Board validation → size===10 enforced for now → mapping math is 10×10; generalizing is a contained change recorded here rather than dead code today.
16. tsconfig → single project (no references), `tsc --noEmit && vite build` → project-reference composite mode buys nothing for one app and complicates the build gate.
17. Corner ornaments / frame groove → skipped ornaments; groove approximated by a contrasting inlay ring on the frame top (emissive runes in Mystic) → budget discipline (§10); the inlay delivers the decorative read at 1 draw call.
18. Overshoot with bounce disabled (rule combo) → token stays put (empty path) → matches common house-rule implementations; tested explicitly.
19. Dust-mote idle life → continuous low-rate emitter in the pooled particle system (~50 alive) limited to the key-light shaft volume → §1 requires it; pooling keeps zero per-frame allocation.
20. Win camera → 800 ms spring to a hero start, then slow continuous orbit of the winner until New Game/modal dismiss → spec says "hero orbit"; continuous orbit reads more premium than a static frame.
21. React StrictMode omitted → double-mounted effects fight physics/Canvas lifecycles in r3f apps; FSM strictness provides the equivalent dev guarantees where it matters.
22. npm registry → project-local `.npmrc` pinned to registry.npmjs.org → the machine's corporate registry (npme.walmart.com) is unreachable off-VPN and stalled installs.
23. Jumps fire on ARRIVAL only (empty-path turns never re-trigger the jump under the token) → caught by the bounce-off test: a player parked at 98 must not ride the snake again.
24. Headless verification → dev-only `__sl_debug` pumps fixed-dt frames through r3f `advance()` (and can drop GL draws) → the harness page gets no rAF when hidden; this drives the REAL engine (physics, choreographer, FSM callbacks) deterministically for gates 3/7/9 and future CI.
25. Tube winding bug (root cause of "dark snakes") → tapered-tube indices were CW from outside, so faces were back-facing; DoubleSide "fixed" visibility but made three negate the outward normals → flipped winding to CCW, removed DoubleSide → correctly lit, saturated bodies. Lesson recorded: verify winding before reaching for DoubleSide.
26. Snake self-glow shell → second tube geometry baked at +8% radius, additive vertex-colored unlit material (walnut 0.35 / mystic 0.5) → a uniform mesh scale shifts rather than inflates a tube; baked inflation gives an exact silhouette with no z-fighting.
27. Camera default by aspect → portrait gets distance up to 22 and polar 47° → a fixed r=14 framed only half the board on 390×844.
28. Auto-tiering paused while `document.hidden` → hidden tabs get throttled rAF; sampling there would wrongly drop visible-quality tiers.
