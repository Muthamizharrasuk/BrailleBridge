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
