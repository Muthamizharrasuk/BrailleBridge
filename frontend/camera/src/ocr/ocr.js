import { cleanLines, linesFromData } from './cleanup.js';
import { loadDictionary, makeFixer } from './spellfix.js';

// Browser OCR via Tesseract.js. The engine, worker and English language data are
// downloaded from a CDN the first time, so the first scan needs internet.
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const GOOD_CONFIDENCE = 70; // stop trying other variants above this
export const LOW_CONFIDENCE = 45; // below this, the result is reported as poor

export function validateImageFile(file) {
  if (!file) throw new Error('No image selected.');
  if (!file.type?.startsWith('image/')) throw new Error('That file is not an image. Choose a JPG, PNG or similar photo.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('That image is larger than 15 MB. Try a smaller photo.');
}

let sharedWorker = null;
let progressSink = null;

// One warm worker is reused across scans (faster) and returns word-level confidences.
async function loadRecognize() {
  try {
    const mod = await import('tesseract.js');
    const lib = mod.default ?? mod;
    return async (image, _lang, { logger } = {}) => {
      progressSink = logger;
      // Automatic page segmentation (PSM 3) reads multi-line pages far better than the library's
      // default single-block mode (measured: 0-3% vs 2-22% word errors on real page photos).
      sharedWorker ??= (async () => {
        const w = await lib.createWorker('eng', 1, { logger: (m) => progressSink?.(m) });
        await w.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
        return w;
      })();
      const worker = await sharedWorker;
      return worker.recognize(image, {}, { text: true, blocks: true });
    };
  } catch {
    throw new Error('Could not load the OCR engine. Check your internet connection and reload.');
  }
}

async function runOnce(image, recognize, onProgress, fix) {
  let result;
  try {
    result = await recognize(image, 'eng', {
      logger: (m) => { if (m.status === 'recognizing text') onProgress?.(m.progress); },
    });
  } catch (error) {
    throw new Error(`Text recognition failed: ${error?.message || 'unknown error'}. Try a clearer, well-lit photo.`);
  }
  const rawText = (result?.data?.text ?? '').replace(/\s+$/g, '');
  const confidence = Number.isFinite(result?.data?.confidence) ? result.data.confidence : 0;
  if (!rawText.trim()) return { text: '', rawText: '', confidence: 0, removed: [], flagged: [], corrections: [], gaps: [], lineCount: 0, medianLineHeight: null, uncorrectedText: '' };
  const lines = linesFromData(result.data);
  const cleaned = cleanLines(lines, { fix, isWord: fix?.isWord });
  const heights = lines.map((l) => l.height).filter(Boolean).sort((a, b) => a - b);
  const medianLineHeight = heights.length ? heights[Math.floor(heights.length / 2)] : null;
  // If cleanup somehow removed everything, fall back to the raw scan.
  const text = cleaned.text.trim() ? cleaned.text : rawText;
  const usedClean = cleaned.text.trim() !== '';
  return {
    text, rawText, confidence, removed: cleaned.removed, flagged: cleaned.flagged,
    gaps: usedClean ? cleaned.gaps : [], lineCount: usedClean ? cleaned.lineCount : rawText.split('\n').length, medianLineHeight,
    scaleUsed: 1,
    corrections: usedClean ? cleaned.corrections : [], uncorrectedText: usedClean ? cleaned.uncorrectedText : rawText,
  };
}

export async function recognizeText(image, { onProgress, recognizeImpl } = {}) {
  const recognize = recognizeImpl ?? await loadRecognize();
  const { text } = await runOnce(image, recognize, onProgress);
  if (!text.trim()) throw new Error('No text was found in the image. Try a closer, brighter, sharper photo of printed text.');
  return text;
}

/**
 * Reads text robustly for users who cannot check their photo.
 * 1) cleaned-up image; 2) original if confidence is not good; 3) rotations if still not good.
 * Returns the highest-confidence attempt: { text, confidence, attempts }.
 */
export async function recognizeBest(image, { onProgress, onStatus, recognizeImpl, tools, dictionary } = {}) {
  const recognize = recognizeImpl ?? await loadRecognize();
  // `dictionary: null` turns spell-fix off; undefined loads the built-in word lists.
  const dict = dictionary === undefined ? (recognizeImpl ? null : await loadDictionary()) : dictionary;
  const fix = dict ? makeFixer(dict) : undefined;
  let best = { text: '', confidence: 0 };
  let attempts = 0;
  let firstError = null;
  const attempt = async (label, getImage) => {
    onStatus?.(label);
    attempts += 1;
    try {
      const r = await runOnce(await getImage(), recognize, onProgress, fix);
      if (r.confidence > best.confidence || (!best.text.trim() && r.text.trim())) best = r;
    } catch (e) { firstError ??= e; }
  };

  let enhanced = image;
  if (tools) {
    try { enhanced = await tools.enhance(image); } catch { enhanced = image; }
  }
  await attempt('Reading the page…', async () => enhanced);
  if (best.confidence < GOOD_CONFIDENCE && enhanced !== image) await attempt('Trying the original photo…', async () => image);
  // Tesseract can report middling confidence on sideways text, so try rotations unless clearly good.
  if (best.confidence < GOOD_CONFIDENCE && tools) {
    for (const deg of [90, 180, 270]) {
      await attempt('Trying a different page orientation…', () => tools.rotate(enhanced, deg));
      if (best.confidence >= GOOD_CONFIDENCE) break;
    }
  }
  if (!best.text.trim()) {
    if (firstError && attempts === 1) throw firstError;
    throw new Error('No text was found in the image. Try a closer, brighter, sharper photo of printed text.');
  }
  let textHeightPx = null; // line height as it appears in the ORIGINAL photo (what the camera captured)
  try {
    if (tools?.size && best.medianLineHeight) {
      const [o, e] = await Promise.all([tools.size(image), tools.size(enhanced)]);
      const scale = Math.max(e.w, e.h) / Math.max(o.w, o.h);
      textHeightPx = best.medianLineHeight / scale;
    }
  } catch { /* optional */ }
  return { ...best, attempts, textHeightPx };
}

export function describeConfidence(confidence) {
  if (confidence >= GOOD_CONFIDENCE) return { level: 'good', message: 'Text read clearly. Please still check it for mistakes.' };
  if (confidence >= LOW_CONFIDENCE) return { level: 'fair', message: 'Text was read, but some parts may be wrong. Check it carefully, or take another photo.' };
  return { level: 'poor', message: 'The text is hard to read and is likely to contain errors. Please take another photo with better light, held closer and steady.' };
}
