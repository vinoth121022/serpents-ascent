import { CanvasTexture, SRGBColorSpace } from 'three';
import { cellToGrid } from '../../core';
import type { Theme } from '../theme/themes';

/**
 * All 100 cell numbers baked into ONE transparent texture, applied as a single
 * overlay plane — 1 draw call instead of 100 text meshes (spec §4).
 * Canvas top = far edge (row 9); canvas left = -X. Matches cellToWorld.
 */
export function makeNumbersTexture(theme: Theme): CanvasTexture {
  const S = 2048;
  const cs = S / 10;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2d canvas unavailable');

  ctx.clearRect(0, 0, S, S);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let n = 1; n <= 100; n++) {
    const { row, col } = cellToGrid(n);
    const cx = col * cs + cs / 2;
    const cy = (9 - row) * cs + cs / 2;

    // Soft accent disc behind the start and finish cells.
    if (n === 1 || n === 100) {
      ctx.fillStyle = n === 1 ? theme.startTint : theme.finishTint;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = theme.numberInk;
    ctx.font = `600 ${Math.round(cs * 0.34)}px Georgia, 'Times New Roman', serif`;
    ctx.fillText(String(n), cx, cy);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
