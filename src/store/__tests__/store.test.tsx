// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { formatEvent, simulateGame, snapshot } from '../../core';
import { useStore } from '../index';

afterEach(cleanup);

describe('store ↔ core bridge', () => {
  it('drives a full scripted game through the store dispatch chain (gate 3 path)', () => {
    const s = useStore.getState();
    s.setInstantMode(true);
    s.newGame({ names: ['P1', 'P2'], seed: 42 });
    let safety = 0;
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
    const viaStore = snapshot(useStore.getState().game);
    const viaCore = snapshot(simulateGame({ playerNames: ['P1', 'P2'], seed: 42 }));
    expect(viaStore).toEqual(viaCore);
  });

  it('ignores roll requests outside AWAITING_ROLL', () => {
    const s = useStore.getState();
    s.newGame({ names: ['P1', 'P2'], seed: 7 });
    useStore.getState().roll();
    expect(useStore.getState().game.phase).toBe('DICE_ROLLING');
    const before = useStore.getState().game;
    useStore.getState().roll(); // must be a no-op
    expect(useStore.getState().game).toBe(before);
  });
});

describe('turn log formatting in the DOM', () => {
  it('renders formatted core events', () => {
    const players = [
      { id: 0, name: 'Asha', cell: 4 },
      { id: 1, name: 'Ravi', cell: 0 },
    ];
    const line = formatEvent({ type: 'JUMPED', player: 0, kind: 'ladder', from: 4, to: 14 }, players);
    render(<div role="log">{line}</div>);
    expect(screen.getByRole('log').textContent).toBe('Asha climbed a ladder to 14');
  });
});
