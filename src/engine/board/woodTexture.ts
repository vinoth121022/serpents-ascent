import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';

/**
 * Procedural wood-grain texture — generated in a canvas, no external asset fetch
 * (keeps the project's offline-safe rule, DECISIONS.md #7). Returns an sRGB
 * CanvasTexture configured for tiling with mipmaps; the caller sets `.anisotropy`
 * from the renderer caps to kill shimmer at oblique angles.
 *
 * Deliberately light + high-contrast so the grain stays visible when the tile's
 * per-instance color multiplies it (a dark/low-contrast map washes out to nothing).
 */
export function makeWoodTexture(size = 512): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return configure(new CanvasTexture(canvas));

  // Light wood base.
  ctx.fillStyle = '#c89a5e';
  ctx.fillRect(0, 0, size, size);

  // Grain: fine horizontal value bands with wavy flow + per-row noise.
  for (let y = 0; y < size; y += 1) {
    const wave = Math.sin(y * 0.045) * 8 + Math.sin(y * 0.13) * 3;
    const band = Math.sin((y + wave) * 0.45);
    const t = 0.5 + band * 0.34 + (Math.random() - 0.5) * 0.09; // strong light/dark swing
    const r = Math.round(150 + t * 78);
    const g = Math.round(95 + t * 60);
    const b = Math.round(45 + t * 40);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y, size, 1);
  }

  // Darker drifting grain streaks for character.
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = '#5a3818';
  for (let i = 0; i < 16; i += 1) {
    const x = Math.random() * size;
    ctx.lineWidth = 0.6 + Math.random() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= size; y += 12) ctx.lineTo(x + Math.sin(y * 0.04 + i) * 14, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  return configure(new CanvasTexture(canvas));
}

function configure(tex: CanvasTexture): CanvasTexture {
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}
