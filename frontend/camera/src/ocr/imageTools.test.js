import { describe, expect, it } from 'vitest';
import { flattenAndStretch } from './imageTools.js';

// Text-like stripes (every 4th column dark) on a page with brightness `bg`.
function page(bg, ink, w = 64, h = 64) {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = x % 4 === 0 ? ink : bg;
  return g;
}
const contrastOf = (a) => Math.max(...a) - Math.min(...a);

describe('flattenAndStretch', () => {
  it('restores contrast for a dark page', () => {
    const out = flattenAndStretch(page(60, 8), 64, 64);
    expect(contrastOf(out)).toBeGreaterThan(150);
  });
  it('keeps text darker than the page', () => {
    const out = flattenAndStretch(page(200, 20), 64, 64);
    expect(out[0]).toBeLessThan(out[1]); // x=0 is ink, x=1 is page
  });
  it('removes a left-to-right shadow gradient', () => {
    const w = 128; const h = 32;
    const g = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = (x % 4 === 0 ? 0.1 : 1) * (60 + x * 1.5);
    const out = flattenAndStretch(g, w, h);
    const pageAt = (x) => out[5 * w + x + 1];
    expect(Math.abs(pageAt(8) - pageAt(112))).toBeLessThan(40); // page level similar across the shadow
  });
});

import { estimateSkew } from './imageTools.js';

// Synthetic "text": dark horizontal dashes in rows, rotated by `deg`.
function tilted(deg, w = 400, h = 400) {
  const g = new Float32Array(w * h).fill(255);
  const rad = (deg * Math.PI) / 180;
  for (let row = 0; row < 14; row++) {
    for (let x = 30; x < 370; x++) {
      if (x % 9 > 6) continue; // gaps like words
      const y0 = 60 + row * 22;
      const y = Math.round(y0 + (x - w / 2) * Math.tan(rad));
      for (let t = 0; t < 4; t++) if (y + t >= 0 && y + t < h) g[(y + t) * w + x] = 0;
    }
  }
  return g;
}

describe('estimateSkew', () => {
  it('finds about 0 for straight text', () => {
    expect(Math.abs(estimateSkew(tilted(0), 400, 400))).toBeLessThanOrEqual(0.5);
  });
  it.each([4, -4, 7])('detects a %i degree tilt', (deg) => {
    expect(estimateSkew(tilted(deg), 400, 400)).toBeCloseTo(deg, 0);
  });
  it('is not fooled by a black strip along the bottom edge', () => {
    const g = tilted(-3);
    for (let y = 392; y < 400; y++) for (let x = 0; x < 400; x++) g[y * 400 + x] = 0;
    expect(Math.abs(estimateSkew(g, 400, 400) - -3)).toBeLessThanOrEqual(1);
  });
});
