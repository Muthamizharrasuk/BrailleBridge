import { describe, expect, it } from 'vitest';
import { assessQuality, grayFromRgba, measureGray } from './imageQuality.js';

const flat = (v, w = 20, h = 20) => ({ gray: new Float32Array(w * h).fill(v), w, h });
const stripes = (w = 20, h = 20) => {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = (x % 2) * 255;
  return { gray: g, w, h };
};

describe('image quality', () => {
  it('converts RGBA to gray', () => {
    expect(Array.from(grayFromRgba(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1))).toEqual([255, 0]);
  });
  it('measures flat images as zero contrast and zero sharpness', () => {
    const { gray, w, h } = flat(200);
    const m = measureGray(gray, w, h);
    expect(m).toMatchObject({ brightness: 200, contrast: 0, sharpness: 0 });
  });
  it('measures detailed images as high contrast and sharpness', () => {
    const { gray, w, h } = stripes();
    const m = measureGray(gray, w, h);
    expect(m.contrast).toBeGreaterThan(100);
    expect(m.sharpness).toBeGreaterThan(1000);
  });
  it.each([
    [{ brightness: 40, contrast: 18, sharpness: 700 }, 'dark', /dark/i],
    [{ brightness: 200, contrast: 10, sharpness: 300 }, 'lowContrast', /closer/i],
    [{ brightness: 220, contrast: 29, sharpness: 75 }, 'blurry', /blurry/i],
  ])('flags %j', (m, issue, re) => {
    const r = assessQuality(m);
    expect(r).toMatchObject({ ok: false, issue });
    expect(r.message).toMatch(re);
  });
  it('accepts a good image', () => {
    expect(assessQuality({ brightness: 220, contrast: 46, sharpness: 13000 })).toMatchObject({ ok: true });
  });
});
