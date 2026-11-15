// Pure image-quality measurement so the app can judge lighting, focus and framing
// for users who cannot see the camera view.
export function grayFromRgba(data, width, height) {
  const gray = new Float32Array(width * height);
  for (let i = 0, j = 0; i < gray.length; i += 1, j += 4) {
    gray[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  }
  return gray;
}

export function measureGray(gray, width, height) {
  const n = gray.length;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += gray[i];
  const brightness = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i += 1) varSum += (gray[i] - brightness) ** 2;
  const contrast = Math.sqrt(varSum / n);
  // Sharpness: variance of the Laplacian (higher = more edge detail).
  let lapSum = 0; let lapSq = 0; let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      lapSum += lap; lapSq += lap * lap; count += 1;
    }
  }
  const mean = count ? lapSum / count : 0;
  const sharpness = count ? lapSq / count - mean * mean : 0;
  return { brightness, contrast, sharpness };
}

// Calibrated on rendered pages: clean ~ contrast 46 / sharpness 13000; mild blur ~ 4000; heavy blur ~ 75.
export const THRESHOLDS = { dark: 100, lowContrast: 26, blurry: 400 };

// Returns the single most useful instruction, in priority order.
export function assessQuality(m, t = THRESHOLDS) {
  const issues = [];
  if (m.brightness < t.dark) issues.push('dark');
  else if (m.contrast < t.lowContrast) issues.push('lowContrast');
  else if (m.sharpness < t.blurry) issues.push('blurry');
  const messages = {
    dark: 'Too dark. Turn on a light or move to a brighter spot.',
    lowContrast: 'I cannot see clear text. Move closer so the page fills the view, and avoid glare or shadows.',
    blurry: 'The image is blurry. Hold the phone steady and move a little farther away.',
  };
  return issues.length
    ? { ok: false, issue: issues[0], message: messages[issues[0]] }
    : { ok: true, issue: null, message: 'Looks good. Hold still.' };
}

// Detect a light page against a meaningfully darker background. When the contrast is
// ambiguous (for example white paper on a white table), return confident:false and do
// not prevent the existing quality-based auto capture.
export function detectPageBounds(gray, width, height) {
  const edge = Math.max(1, Math.round(Math.min(width, height) * 0.06));
  let borderSum = 0; let borderCount = 0; let centerSum = 0; let centerCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = gray[y * width + x];
      if (x < edge || x >= width - edge || y < edge || y >= height - edge) {
        borderSum += value; borderCount += 1;
      } else if (x > width * .3 && x < width * .7 && y > height * .3 && y < height * .7) {
        centerSum += value; centerCount += 1;
      }
    }
  }
  const border = borderSum / Math.max(1, borderCount);
  const center = centerSum / Math.max(1, centerCount);
  if (center - border < 24) return { confident: false };

  const threshold = border + (center - border) * .48;
  const rowCounts = new Uint32Array(height); const columnCounts = new Uint32Array(width);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (gray[y * width + x] >= threshold) { rowCounts[y] += 1; columnCounts[x] += 1; }
  }
  const goodRows = Array.from(rowCounts, (count, y) => count >= width * .32 ? y : -1).filter((v) => v >= 0);
  const goodColumns = Array.from(columnCounts, (count, x) => count >= height * .32 ? x : -1).filter((v) => v >= 0);
  if (!goodRows.length || !goodColumns.length) return { confident: false };
  const top = goodRows[0]; const bottom = goodRows.at(-1);
  const left = goodColumns[0]; const right = goodColumns.at(-1);
  return {
    confident: true, left, right, top, bottom,
    widthRatio: (right - left + 1) / width,
    heightRatio: (bottom - top + 1) / height,
    centerX: (left + right) / (2 * width),
    centerY: (top + bottom) / (2 * height),
    clipped: left <= edge || right >= width - edge - 1 || top <= edge || bottom >= height - edge - 1,
  };
}

export function assessFrame(metrics, bounds) {
  const quality = assessQuality(metrics);
  if (!quality.ok || !bounds?.confident) return quality;
  if (bounds.clipped) return { ok: false, issue: 'pageClipped', message: 'Part of the page is outside the view. Move the phone a little farther away.' };
  if (bounds.widthRatio < .52 || bounds.heightRatio < .52) {
    return { ok: false, issue: 'pageSmall', message: 'The page is too small in the view. Move the phone closer.' };
  }
  if (bounds.centerX < .4) return { ok: false, issue: 'pageLeft', message: 'Move the phone left to center the page.' };
  if (bounds.centerX > .6) return { ok: false, issue: 'pageRight', message: 'Move the phone right to center the page.' };
  if (bounds.centerY < .38) return { ok: false, issue: 'pageHigh', message: 'Move the phone toward the top of the page.' };
  if (bounds.centerY > .62) return { ok: false, issue: 'pageLow', message: 'Move the phone toward the bottom of the page.' };
  return { ...quality, pageDetected: true };
}

export function measureCanvasLike(source, sw, sh, maxSide = 320) {
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(8, Math.round(sw * scale));
  const h = Math.max(8, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return measureGray(grayFromRgba(data, w, h), w, h);
}

export function analyzeCanvasLike(source, sw, sh, maxSide = 320) {
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const width = Math.max(8, Math.round(sw * scale));
  const height = Math.max(8, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const gray = grayFromRgba(pixels.data, width, height);
  return {
    ...assessFrame(measureGray(gray, width, height), detectPageBounds(gray, width, height)),
    frameSignature: makeFrameSignature(gray, width, height),
  };
}

// A small luminance fingerprint is enough to reject meaningful camera/page
// movement without retaining or transmitting a camera frame.
export function makeFrameSignature(gray, width, height, gridSize = 8) {
  const signature = [];
  for (let gy = 0; gy < gridSize; gy += 1) {
    for (let gx = 0; gx < gridSize; gx += 1) {
      const x0 = Math.floor(gx * width / gridSize); const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * width / gridSize));
      const y0 = Math.floor(gy * height / gridSize); const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * height / gridSize));
      let sum = 0; let count = 0;
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { sum += gray[y * width + x]; count += 1; }
      signature.push(sum / count);
    }
  }
  return signature;
}

export function frameMotionScore(previous, current) {
  if (!previous || !current || previous.length !== current.length || !current.length) return Infinity;
  return current.reduce((sum, value, index) => sum + Math.abs(value - previous[index]), 0) / current.length;
}
