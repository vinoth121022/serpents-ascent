import { useEffect, useMemo, useState } from 'react';
import { cellToGrid, formatEvent, must, TRADITIONAL_BOARD } from '../core';
import { THEMES, type ThemeId } from '../engine/theme/themes';
import {
  BOARD_PALETTE,
  TABLE_PALETTE,
  TOKEN_PALETTE,
  useStore,
  type BoardStyle,
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
    </div>
  );
}

/** Full-height right sidebar: live turn progress on top, live settings below. */
function GameSidebar() {
  const game = useStore((s) => s.game);
  const roll = useStore((s) => s.roll);
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

  const current = must(game.players[game.current]);
  const canRoll = game.phase === 'AWAITING_ROLL';
  const rolling = game.phase === 'DICE_ROLLING';
  const dotColor = playerColors[game.current] ?? '#ffffff';

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
        <div className="roll-hint">{rolling ? 'Rolling the die…' : canRoll ? '🎲 Click the die to roll' : '…'}</div>
        <button className="sr-only" disabled={!canRoll} onClick={roll}>
          Roll the die
        </button>
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
        <text x={x + 1.2} y={y + 3.6} fontSize={2.7} fill="rgba(38,28,12,0.6)">
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
          const px = (-dy / len) * 1.1;
          const py = (dx / len) * 1.1;
          const rungs = Math.max(2, Math.round(len / 5));
          const rungEls = [];
          for (let k = 1; k < rungs; k++) {
            const tt = k / rungs;
            const cx = a.x + dx * tt;
            const cy = a.y + dy * tt;
            rungEls.push(<line key={k} x1={cx + px} y1={cy + py} x2={cx - px} y2={cy - py} stroke="#a06a32" strokeWidth={0.55} />);
          }
          return (
            <g key={`L${i}`}>
              <line x1={a.x + px} y1={a.y + py} x2={b.x + px} y2={b.y + py} stroke="#a06a32" strokeWidth={0.85} />
              <line x1={a.x - px} y1={a.y - py} x2={b.x - px} y2={b.y - py} stroke="#a06a32" strokeWidth={0.85} />
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
          const mx = (a.x + b.x) / 2 + (-dy / len) * 4;
          const my = (a.y + b.y) / 2 + (dx / len) * 4;
          const hue = SNAKE_HUES[i % SNAKE_HUES.length] ?? '#3e6b5a';
          return (
            <g key={`S${i}`}>
              <path d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`} fill="none" stroke={hue} strokeWidth={2.1} strokeLinecap="round" />
              <circle cx={a.x} cy={a.y} r={2} fill={hue} />
              <circle cx={a.x - 0.7} cy={a.y - 0.7} r={0.4} fill="#fff" />
              <circle cx={a.x + 0.7} cy={a.y - 0.7} r={0.4} fill="#fff" />
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

        <label>Players</label>
        <div className="seg">
          {[2, 3, 4].map((n) => (
            <button key={n} className={count === n ? 'on' : undefined} onClick={() => setCount(n)}>
              {n}
            </button>
          ))}
        </div>

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
