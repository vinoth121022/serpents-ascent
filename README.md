# Serpent's Ascent

A premium 3D Snake & Ladder platform — React 18 + TypeScript + Three.js (@react-three/fiber),
physics dice (Rapier), pure-TS rules core, two themes, hot-seat 2–4 players.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | typecheck + production build |
| `npm test` | unit tests + enforced 100% coverage on `src/core` |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm run verify` | lint + boundary check + tests + build (the full gate) |
| `npm run verify:boundaries` | proves `src/core` imports no framework code |

## Playing

Roll with the button or **Space**. Drag to orbit (360° azimuth, 15–80° polar), wheel/pinch to
zoom, right-drag to pan. **R** / double-click / ⌖ View resets the camera. ⚙ Settings: themes
(Heritage Walnut / Mystic Realm), quality tier, sound, and New Game (2–4 players, rule flags,
reproducible seed under Advanced).

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layer map, the core/engine boundary, state flow,
  how multiplayer/AI/replay land without rewrites.
- [docs/DECISIONS.md](docs/DECISIONS.md) — running decision log.
- [docs/VERIFICATION.md](docs/VERIFICATION.md) — acceptance-gate evidence.

The original single-file prototype lives in `prototype/board-v0.html`.
