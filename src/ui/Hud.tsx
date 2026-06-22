import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cellToGrid, formatEvent, must, TRADITIONAL_BOARD } from '../core';
import { THEMES, type ThemeId } from '../engine/theme/themes';
import {
  BOARD_PALETTE,
  TABLE_PALETTE,
  TOKEN_PALETTE,
  useStore,
  type BoardStyle,
  type CameraMode,
  type Gender,
  type QualitySetting,
} from '../store';
import { soundBus } from './sound/SoundBus';
import './styles.css';

export function Hud() {
  const started = useStore((s) => s.started);
  const soundOn = useStore((s) => s.soundOn);

  // Mute applies everywhere (setup + match).
  useEffect(() => {
    soundBus.muted = !soundOn;
  }, [soundOn]);

  // Keyboard (only while a match is running): Space = roll, R = reset view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!useStore.getState().started) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        useStore.getState().roll();
      } else if (e.code === 'KeyR') {
        useStore.getState().requestResetView();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onDbl = (e: MouseEvent): void => {
      if (useStore.getState().started && (e.target as HTMLElement).tagName === 'CANVAS') {
        useStore.getState().requestResetView();
      }
    };
    window.addEventListener('dblclick', onDbl);
    return () => window.removeEventListener('dblclick', onDbl);
  }, []);

  return (
    <div className="hud">
      <div className="brand panel">
        Serpent&apos;s <b>Ascent</b>
      </div>
      {!started ? (
        <SetupScreen />
      ) : (
        <>
          <GameSidebar />
          <VignettePulse />
          <WinModal />
        </>
      )}
      {/* Landscape-only: a portrait device gets a rotate prompt instead of the game. */}
      <div className="rotate-gate" role="alert">
        <div className="rotate-icon">📱</div>
        <h2>
          Rotate to <b>Landscape</b>
        </h2>
        <p>Serpent&apos;s Ascent is designed for landscape — turn your device sideways to play.</p>
      </div>
    </div>
  );
}

/** Full-height right sidebar: live turn progress on top, live settings below. */
function GameSidebar() {
  const game = useStore((s) => s.game);
  const roll = useStore((s) => s.roll);
  const rollWith = useStore((s) => s.rollWith);
  const requestResetView = useStore((s) => s.requestResetView);
  const backToSetup = useStore((s) => s.backToSetup);
  const playerColors = useStore((s) => s.playerColors);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const quality = useStore((s) => s.quality);
  const setQuality = useStore((s) => s.setQuality);
  const resolvedTier = useStore((s) => s.resolvedTier);
  const soundOn = useStore((s) => s.soundOn);
  const setSoundOn = useStore((s) => s.setSoundOn);
  const cameraMode = useStore((s) => s.cameraMode);
  const setCameraMode = useStore((s) => s.setCameraMode);

  const current = must(game.players[game.current]);
  const canRoll = game.phase === 'AWAITING_ROLL';
  const rolling = game.phase === 'DICE_ROLLING';
  const dotColor = playerColors[game.current] ?? '#ffffff';
  const [testDie, setTestDie] = useState(6); // TEST-ONLY

  const logLines = useMemo(
    () =>
      game.log
        .filter((e) => e.type !== 'GAME_STARTED' && e.type !== 'TURN_PASSED')
        .slice(-6)
        .map((e) => formatEvent(e, game.players)),
    [game.log, game.players],
  );

  return (
    <div className="rail panel">
      <div className="rail-scroll">
        <div className="turn-chip">
          <span className="dot" style={{ background: dotColor, color: dotColor }} />
          {game.phase === 'WIN' ? `${must(game.players[game.winner ?? 0]).name} wins!` : `${current.name}'s turn`}
        </div>
        <button className="roll-hint" disabled={!canRoll} onClick={roll} title="Roll the die">
          {rolling ? 'Rolling the die…' : canRoll ? '🎲 Click the die — or tap here — to roll' : '…'}
        </button>

        {/* TEST-ONLY: enter a die value (1–6) and move by it. Remove this block (and
            store.rollWith) when no longer needed. */}
        <div
          className="test-roll"
          style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0', fontSize: 13, opacity: 0.9 }}
        >
          <span title="Testing only">🧪 Test roll</span>
          <input
            type="number"
            min={1}
            max={6}
            value={testDie}
            onChange={(e) => setTestDie(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canRoll) rollWith(testDie);
            }}
            style={{ width: 48, padding: '4px 6px', textAlign: 'center', borderRadius: 6 }}
          />
          <button className="icon-btn" disabled={!canRoll} onClick={() => rollWith(testDie)} style={{ padding: '4px 10px' }}>
            Move
          </button>
        </div>

        <div className="log">
          {logLines.length === 0 && <span>Roll a 1 or 6 to enter — then land exactly on 100 to win.</span>}
          {logLines.map((line, i) => (
            <span key={`${i}-${line}`} className={i === logLines.length - 1 ? 'latest' : undefined}>
              {line}
            </span>
          ))}
        </div>

        <div className="rail-divider" />
        <div className="rail-section">
          ⚙ Settings <span>— changes apply live</span>
        </div>

        <label>Theme</label>
        <div className="seg">
          {(Object.keys(THEMES) as ThemeId[]).map((id) => (
            <button key={id} className={theme === id ? 'on' : undefined} onClick={() => setTheme(id)}>
              {THEMES[id].label}
            </button>
          ))}
        </div>

        <BoardColorPicker />

        <label>Camera</label>
        <div className="seg">
          {(
            [
              ['cinematic', '🎬 Cinematic', 'Auto director: close-up on the die, then tracks your piece as it moves'],
              ['follow', '👤 Follow', 'Single-person view: over-the-shoulder of your piece while it moves'],
              ['free', '🕹 Free', 'Manual orbit — you control the camera'],
            ] as [CameraMode, string, string][]
          ).map(([m, lbl, tip]) => (
            <button key={m} className={cameraMode === m ? 'on' : undefined} onClick={() => setCameraMode(m)} title={tip}>
              {lbl}
            </button>
          ))}
        </div>

        <label>Quality {quality === 'auto' ? `(auto → ${resolvedTier})` : ''}</label>
        <div className="seg">
          {(['auto', 'high', 'medium', 'low'] as QualitySetting[]).map((q) => (
            <button key={q} className={quality === q ? 'on' : undefined} onClick={() => setQuality(q)}>
              {q}
            </button>
          ))}
        </div>

        <div className="toggle-row" style={{ marginTop: 10 }}>
          <span>Sound</span>
          <div className="seg" style={{ width: 110 }}>
            <button className={soundOn ? 'on' : undefined} onClick={() => setSoundOn(true)}>
              on
            </button>
            <button className={!soundOn ? 'on' : undefined} onClick={() => setSoundOn(false)}>
              off
            </button>
          </div>
        </div>
      </div>

      <div className="rail-buttons">
        <button className="icon-btn" onClick={requestResetView} title="Reset view (R)">
          ⌖ View
        </button>
        <button className="icon-btn" onClick={backToSetup} title="Main menu">
          ⌂ Menu
        </button>
      </div>
    </div>
  );
}

function VignettePulse() {
  const pulseId = useStore((s) => s.vignettePulseId);
  return <div key={pulseId} className={pulseId > 0 ? 'vignette-pulse go' : 'vignette-pulse'} />;
}

function WinModal() {
  const game = useStore((s) => s.game);
  const backToSetup = useStore((s) => s.backToSetup);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (game.phase !== 'WIN') {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, [game.phase]);

  if (game.phase !== 'WIN' || !visible) return null;
  const winner = must(game.players[game.winner ?? 0]);
  return (
    <div className="modal-backdrop">
      <div className="modal panel">
        <div className="win-title">🏆 {winner.name} wins!</div>
        <div className="win-sub">
          {game.turnNumber} turns · {game.log.filter((e) => e.type === 'JUMPED').length} snakes &amp; ladders ridden
        </div>
        <div className="actions">
          <button className="primary-btn" onClick={backToSetup}>
            New match
          </button>
        </div>
      </div>
    </div>
  );
}

const SNAKE_HUES = ['#2e7d4f', '#b03a2e', '#7c3aae', '#1f7a8c', '#a85f00', '#31407a', '#6d8f2f', '#8c2f5d', '#3e6b5a'];

/** SVG cell center in the 0..100 viewBox (cell 1 bottom-left, serpentine). */
function cellCenter(n: number): { x: number; y: number } {
  const { row, col } = cellToGrid(n);
  return { x: col * 10 + 5, y: (9 - row) * 10 + 5 };
}

/** A live mini of the ACTUAL board — numbered cells with the chosen colors, real
 * ladders (rails + rungs) and snakes (curved, with heads). Reflects color picks live. */
function BoardPreview() {
  const boardColors = useStore((s) => s.boardColors);
  const tableColor = useStore((s) => s.tableColor);

  const cells = [];
  for (let n = 1; n <= 100; n++) {
    const { row, col } = cellToGrid(n);
    const x = col * 10;
    const y = (9 - row) * 10;
    const light = (row + col) % 2 === 0;
    cells.push(
      <g key={n}>
        <rect x={x} y={y} width={10} height={10} fill={light ? boardColors[0] : boardColors[1]} />
        <text x={x + 1.1} y={y + 3.4} fontSize={2.3} fill="rgba(38,28,12,0.42)">
          {n}
        </text>
      </g>,
    );
  }

  const ladders = TRADITIONAL_BOARD.jumps.filter((j) => j.kind === 'ladder');
  const snakes = TRADITIONAL_BOARD.jumps.filter((j) => j.kind === 'snake');

  return (
    <div className="board-preview" style={{ background: tableColor }}>
      <svg viewBox="0 0 100 100" className="bp-svg">
        {cells}
        {ladders.map((j, i) => {
          const a = cellCenter(j.from);
          const b = cellCenter(j.to);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const px = (-dy / len) * 0.85;
          const py = (dx / len) * 0.85;
          const rungs = Math.max(2, Math.round(len / 4.5));
          const rungEls = [];
          for (let k = 1; k < rungs; k++) {
            const tt = k / rungs;
            const cx = a.x + dx * tt;
            const cy = a.y + dy * tt;
            rungEls.push(<line key={k} x1={cx + px} y1={cy + py} x2={cx - px} y2={cy - py} stroke="#b9823e" strokeWidth={0.42} strokeLinecap="round" />);
          }
          return (
            <g key={`L${i}`} stroke="#7a4e21" strokeWidth={0.95} strokeLinecap="round">
              {/* dark base for definition, then the lighter rails on top */}
              <line x1={a.x + px} y1={a.y + py} x2={b.x + px} y2={b.y + py} />
              <line x1={a.x - px} y1={a.y - py} x2={b.x - px} y2={b.y - py} />
              <g stroke="#c89150" strokeWidth={0.55}>
                <line x1={a.x + px} y1={a.y + py} x2={b.x + px} y2={b.y + py} />
                <line x1={a.x - px} y1={a.y - py} x2={b.x - px} y2={b.y - py} />
              </g>
              {rungEls}
            </g>
          );
        })}
        {snakes.map((j, i) => {
          const a = cellCenter(j.from);
          const b = cellCenter(j.to);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const mx = (a.x + b.x) / 2 + (-dy / len) * 3.2;
          const my = (a.y + b.y) / 2 + (dx / len) * 3.2;
          const hue = SNAKE_HUES[i % SNAKE_HUES.length] ?? '#3e6b5a';
          const d = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
          return (
            <g key={`S${i}`} strokeLinecap="round" fill="none">
              {/* dark casing under a slimmer colored body keeps it readable over tiles */}
              <path d={d} stroke="rgba(20,14,8,0.5)" strokeWidth={1.9} />
              <path d={d} stroke={hue} strokeWidth={1.25} />
              <circle cx={a.x} cy={a.y} r={1.5} fill={hue} stroke="rgba(20,14,8,0.5)" strokeWidth={0.3} />
              <circle cx={a.x - 0.5} cy={a.y - 0.5} r={0.28} fill="#fff" stroke="none" />
              <circle cx={a.x + 0.5} cy={a.y - 0.5} r={0.28} fill="#fff" stroke="none" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Board tile / table / surface pickers — shared by the sidebar and Setup; writes live. */
function BoardColorPicker() {
  const boardColors = useStore((s) => s.boardColors);
  const setBoardColors = useStore((s) => s.setBoardColors);
  const tableColor = useStore((s) => s.tableColor);
  const setTableColor = useStore((s) => s.setTableColor);
  const boardStyle = useStore((s) => s.boardStyle);
  const setBoardStyle = useStore((s) => s.setBoardStyle);

  return (
    <>
      <label>Board tiles</label>
      <div className="swatches">
        {BOARD_PALETTE.map((pair) => {
          const active = boardColors[0] === pair[0] && boardColors[1] === pair[1];
          return (
            <button
              key={`${pair[0]}${pair[1]}`}
              className={active ? 'sw on' : 'sw'}
              style={{ background: `linear-gradient(135deg, ${pair[0]} 0 50%, ${pair[1]} 50% 100%)` }}
              onClick={() => setBoardColors([pair[0], pair[1]])}
              aria-label={`Board ${pair[0]} and ${pair[1]}`}
            />
          );
        })}
      </div>

      <label>Table</label>
      <div className="swatches">
        {TABLE_PALETTE.map((c) => (
          <button
            key={c}
            className={tableColor === c ? 'sw on' : 'sw'}
            style={{ background: c }}
            onClick={() => setTableColor(c)}
            aria-label={`Table ${c}`}
          />
        ))}
      </div>

      <label>Surface</label>
      <div className="seg">
        {(['solid', 'wood'] as BoardStyle[]).map((b) => (
          <button key={b} className={boardStyle === b ? 'on' : undefined} onClick={() => setBoardStyle(b)}>
            {b}
          </button>
        ))}
      </div>
    </>
  );
}

const PLAYER_OPTIONS = [
  { count: 2, icon: '👥', label: '2 Players' },
  { count: 3, icon: '👥👥', label: '3 Players' },
  { count: 4, icon: '🎮', label: '4 Players' },
] as const;

/** Premium glassmorphic player-count selector — a gold gradient pill that springs
 * between options (Framer Motion shared layout), with full radio-group keyboard
 * support, focus-visible ring and reduced-motion fallback (WCAG AA). */
function PlayersSelector({ count, setCount }: { count: number; setCount: (n: number) => void }) {
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const spring = reduce
    ? { duration: 0 }
    : ({ type: 'spring', stiffness: 480, damping: 34, mass: 0.7 } as const);

  const select = (i: number): void => {
    const idx = ((i % PLAYER_OPTIONS.length) + PLAYER_OPTIONS.length) % PLAYER_OPTIONS.length;
    const opt = PLAYER_OPTIONS[idx];
    if (opt === undefined) return;
    setCount(opt.count);
    refs.current[idx]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const idx = PLAYER_OPTIONS.findIndex((o) => o.count === count);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      select(idx + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      select(idx - 1);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Number of players"
      onKeyDown={onKeyDown}
      className="flex gap-2 rounded-2xl border border-white/10 bg-white/5 p-1.5 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_10px_30px_rgba(0,0,0,0.45)]"
    >
      {PLAYER_OPTIONS.map((opt, i) => {
        const active = count === opt.count;
        return (
          <motion.button
            key={opt.count}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            tabIndex={active ? 0 : -1}
            onClick={() => setCount(opt.count)}
            whileHover={reduce ? undefined : { y: -2 }}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            transition={spring}
            className="relative isolate flex min-h-[52px] flex-1 cursor-pointer select-none appearance-none items-center justify-center rounded-xl border-0 bg-white/[0.03] px-3 font-[inherit] outline-none transition-colors duration-200 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#FFD166] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0a07]"
          >
            {active && (
              <motion.span
                layoutId="players-active-pill"
                transition={spring}
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-xl"
                style={{
                  background: 'linear-gradient(180deg, #FFE493 0%, #FFD166 45%, #E7AE3C 100%)',
                  boxShadow:
                    '0 0 24px rgba(255,209,102,0.55), 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.5)',
                }}
              />
            )}
            <span
              className={`flex items-center gap-2 font-semibold tracking-wide transition-colors duration-200 ${active ? 'text-[#2a1d07]' : 'text-[#cdbfa6] hover:text-[#f3ecdf]'}`}
            >
              <span aria-hidden="true" className="text-base leading-none">
                {opt.icon}
              </span>
              <span className="whitespace-nowrap text-sm">{opt.label}</span>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

const GENDERS: Gender[] = ['male', 'female'];

function SetupScreen() {
  const startGame = useStore((s) => s.startGame);
  const [count, setCount] = useState(2);
  const [names, setNames] = useState(['', '', '', '']);
  const [genders, setGenders] = useState<Gender[]>(['male', 'female', 'male', 'female']);
  const [colors, setColors] = useState<string[]>([
    TOKEN_PALETTE[0] ?? '#e6432e',
    TOKEN_PALETTE[1] ?? '#2f7fe0',
    TOKEN_PALETTE[2] ?? '#27a25a',
    TOKEN_PALETTE[3] ?? '#e8a417',
  ]);

  const setName = (i: number, v: string): void => setNames(names.map((n, j) => (j === i ? v : n)));
  const setGender = (i: number, g: Gender): void => setGenders(genders.map((x, j) => (j === i ? g : x)));
  const setColor = (i: number, c: string): void => setColors(colors.map((x, j) => (j === i ? c : x)));

  const start = (): void => {
    const finalNames = Array.from({ length: count }, (_, i) => names[i]?.trim() || `Player ${i + 1}`);
    startGame({ names: finalNames, genders: genders.slice(0, count), colors: colors.slice(0, count) });
  };

  return (
    <div className="setup-overlay">
      <div className="setup panel">
        <div className="setup-head">
          <h1>
            Serpent&apos;s <b>Ascent</b>
          </h1>
          <p>Pick your players, colors and board — then climb. Roll a 1 or 6 to enter, land exactly on 100 to win.</p>
        </div>

        <div className="setup-section">
          <div className="setup-section-title">Players</div>
          <PlayersSelector count={count} setCount={setCount} />

        <div className="player-cards">
          {Array.from({ length: count }, (_, i) => (
            <div className="player-card" key={i} style={{ borderColor: colors[i] }}>
              <div className="pc-head">
                <span className="pc-dot" style={{ background: colors[i], color: colors[i] }} />
                <input
                  type="text"
                  value={names[i] ?? ''}
                  placeholder={`Player ${i + 1}`}
                  maxLength={14}
                  onChange={(e) => setName(i, e.target.value)}
                />
              </div>
              <div className="seg pc-gender">
                {GENDERS.map((g) => (
                  <button key={g} className={genders[i] === g ? 'on' : undefined} onClick={() => setGender(i, g)}>
                    {g === 'male' ? '♂ Male' : '♀ Female'}
                  </button>
                ))}
              </div>
              <div className="swatches pc-swatches">
                {TOKEN_PALETTE.map((c) => (
                  <button
                    key={c}
                    className={colors[i] === c ? 'sw on' : 'sw'}
                    style={{ background: c }}
                    onClick={() => setColor(i, c)}
                    aria-label={`Player ${i + 1} color ${c}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        </div>

        <div className="setup-section">
          <div className="setup-section-title">Board appearance</div>
          <div className="setup-board-row">
            <BoardPreview />
            <div className="setup-board-controls">
              <BoardColorPicker />
            </div>
          </div>
        </div>

        <button className="start-btn" onClick={start}>
          ▶ Start game
        </button>
      </div>
    </div>
  );
}
