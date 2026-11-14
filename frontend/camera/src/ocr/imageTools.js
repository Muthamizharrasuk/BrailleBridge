// Browser-only image helpers: clean up a photo before OCR, rotate it, and judge its quality.
import { assessQuality, measureCanvasLike } from './imageQuality.js';

const MAX_SIDE = 2200; // big phone photos make OCR slow without helping accuracy
const MIN_SIDE = 1400; // tiny images lose letter detail

async function toBitmap(blob) {
  return createImageBitmap(blob); // honors EXIF orientation in modern browsers
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the image.'))), 'image/png'));
}

// Local mean via an integral image (box blur of radius r).
function localMean(gray, w, h, r) {
  const W = w + 1;
  const integral = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let row = 0;
    for (let x = 0; x < w; x += 1) {
      row += gray[y * w + x];
      integral[(y + 1) * W + x + 1] = integral[y * W + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - r); const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - r); const x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0];
      out[y * w + x] = sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

// Flatten uneven lighting and shadows (divide by the local background brightness), then
// stretch contrast. A global stretch alone fails when part of the frame is brighter than the page.
export function flattenAndStretch(gray, w, h) {
  const radius = Math.max(12, Math.round(Math.min(w, h) / 10));
  const bg = localMean(gray, w, h, radius);
  const flat = new Float32Array(w * h);
  for (let i = 0; i < flat.length; i += 1) flat[i] = Math.min(255, (gray[i] / Math.max(8, bg[i])) * 200);
  const hist = new Uint32Array(256);
  for (let i = 0; i < flat.length; i += 1) hist[Math.max(0, Math.min(255, Math.round(flat[i])))] += 1;
  const total = flat.length; let acc = 0; let lo = 0; let hi = 255;
  for (let v = 0; v < 256; v += 1) { acc += hist[v]; if (acc >= total * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v -= 1) { acc += hist[v]; if (acc >= total * 0.5) { hi = v; break; } }
  hi = Math.max(hi, lo + 1);
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < out.length; i += 1) out[i] = Math.max(0, Math.min(255, ((flat[i] - lo) * 255) / (hi - lo)));
  return out;
}

// Estimate page tilt in degrees (positive = text runs downhill to the right) by finding the
// angle at which dark pixels line up into the sharpest horizontal rows.
export function estimateSkew(gray, w, h, { maxDeg = 12, step = 0.5 } = {}) {
  const scale = Math.min(1, 480 / Math.max(w, h));
  const sw = Math.max(8, Math.round(w * scale)); const sh = Math.max(8, Math.round(h * scale));
  const ink = [];
  // Ignore the outer 4%: photo borders, screen edges and table edges are long straight lines
  // that would otherwise look perfectly "aligned" and hide the real text tilt.
  const mx = Math.round(sw * 0.04); const my = Math.round(sh * 0.04);
  for (let y = my; y < sh - my; y += 1) {
    for (let x = mx; x < sw - mx; x += 1) {
      if (gray[Math.floor(y / scale) * w + Math.floor(x / scale)] < 110) ink.push(x, y);
    }
  }
  if (ink.length < 200) return 0;
  const cx = sw / 2; const cy = sh / 2;
  const bins = Math.ceil(Math.hypot(sw, sh)) + 2;
  let best = 0; let bestScore = -1;
  const scoreAt = {};
  for (let a = -maxDeg; a <= maxDeg + 1e-9; a += step) {
    const rad = (a * Math.PI) / 180; const sin = Math.sin(rad); const cos = Math.cos(rad);
    const hist = new Float64Array(bins);
    for (let i = 0; i < ink.length; i += 2) {
      const y = (ink[i + 1] - cy) * cos - (ink[i] - cx) * sin + bins / 2;
      hist[Math.max(0, Math.min(bins - 1, Math.round(y)))] += 1;
    }
    let sc = 0;
    for (let i = 1; i < bins; i += 1) sc += (hist[i] - hist[i - 1]) ** 2; // sharp row edges
    scoreAt[a] = sc;
    if (sc > bestScore) { bestScore = sc; best = a; }
  }
  // Only trust a clear improvement over "no rotation".
  return bestScore > (scoreAt[0] ?? 0) * 1.03 ? best : 0;
}

export async function enhance(blob, { deskew = true } = {}) {
  const bmp = await toBitmap(blob);
  const long = Math.max(bmp.width, bmp.height);
  const scale = long > MAX_SIDE ? MAX_SIDE / long : long < MIN_SIDE ? MIN_SIDE / long : 1;
  const w = Math.round(bmp.width * scale); const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gray = new Float32Array(w * h);
  for (let i = 0, j = 0; i < gray.length; i += 1, j += 4) gray[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  const out = flattenAndStretch(gray, w, h);
  for (let i = 0, j = 0; i < out.length; i += 1, j += 4) { d[j] = d[j + 1] = d[j + 2] = out[i]; d[j + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  const skew = deskew ? estimateSkew(out, w, h) : 0;
  if (Math.abs(skew) >= 0.5) {
    // Rotate by -skew onto a white canvas big enough to hold the whole page.
    const rad = (-skew * Math.PI) / 180;
    const rw = Math.ceil(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)));
    const rh = Math.ceil(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)));
    const fixed = document.createElement('canvas');
    fixed.width = rw; fixed.height = rh;
    const fctx = fixed.getContext('2d');
    fctx.fillStyle = '#fff';
    fctx.fillRect(0, 0, rw, rh);
    fctx.translate(rw / 2, rh / 2);
    fctx.rotate(rad);
    fctx.drawImage(canvas, -w / 2, -h / 2);
    return canvasToBlob(fixed);
  }
  return canvasToBlob(canvas);
}

export async function rotate(blob, degrees) {
  const bmp = await toBitmap(blob);
  const swap = degrees % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? bmp.height : bmp.width;
  canvas.height = swap ? bmp.width : bmp.height;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  return canvasToBlob(canvas);
}

export async function assessBlob(blob) {
  const bmp = await toBitmap(blob);
  return assessQuality(measureCanvasLike(bmp, bmp.width, bmp.height));
}

const isHeic = (f) => /^image\/hei[cf]/i.test(f.type || '') || /\.hei[cf]$/i.test(f.name || '');

// Make sure the browser can decode the file. iPhone photos are often HEIC, which Chrome
// cannot read, so convert those to JPEG. Returns a decodable Blob or throws a plain-language error.
export async function prepareFile(file) {
  try {
    (await createImageBitmap(file)).close?.();
    return file;
  } catch { /* fall through */ }
  if (isHeic(file)) {
    try {
      const { default: heic2any } = await import('heic2any');
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      return Array.isArray(out) ? out[0] : out;
    } catch {
      throw new Error('This looks like an iPhone HEIC photo and it could not be converted. In Photos, export it as JPEG, or take the picture with the camera button here.');
    }
  }
  throw new Error('This image could not be opened. Try a JPG or PNG, or use the camera button.');
}

export async function sizeOf(blob) {
  const bmp = await toBitmap(blob);
  return { w: bmp.width, h: bmp.height };
}

export const browserTools = { size: sizeOf, enhance, rotate, assess: assessBlob, prepare: prepareFile };
