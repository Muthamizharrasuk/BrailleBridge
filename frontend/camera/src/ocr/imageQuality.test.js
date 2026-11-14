import { describe, expect, it } from 'vitest';
import { assessFrame, assessQuality, detectPageBounds, grayFromRgba, measureGray } from './imageQuality.js';

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

describe('page framing', () => {
  function pageFrame(width = 100, height = 120, box = { left: 15, right: 84, top: 15, bottom: 104 }) {
    const gray = new Float32Array(width * height).fill(45);
    for (let y = box.top; y <= box.bottom; y += 1) for (let x = box.left; x <= box.right; x += 1) gray[y * width + x] = 225;
    // Add dark text-like stripes so the fixture is not an unrealistically flat page.
    for (let y = box.top + 10; y < box.bottom - 5; y += 8) for (let x = box.left + 8; x < box.right - 8; x += 1) gray[y * width + x] = 35;
    return { gray, width, height };
  }

  it('finds a centered page with visible margins', () => {
    const sample = pageFrame();
    const bounds = detectPageBounds(sample.gray, sample.width, sample.height);
    expect(bounds).toMatchObject({ confident: true, clipped: false });
    expect(bounds.widthRatio).toBeGreaterThan(.6);
  });

  it('does not claim detection when page/background contrast is ambiguous', () => {
    expect(detectPageBounds(new Float32Array(100 * 120).fill(220), 100, 120)).toEqual({ confident: false });
  });

  it('blocks reliable auto capture when a detected page is clipped or too small', () => {
    const quality = { brightness: 210, contrast: 40, sharpness: 1000 };
    expect(assessFrame(quality, { confident: true, clipped: true })).toMatchObject({ ok: false, issue: 'pageClipped' });
    expect(assessFrame(quality, { confident: true, clipped: false, widthRatio: .4, heightRatio: .7 })).toMatchObject({ ok: false, issue: 'pageSmall' });
  });
});
