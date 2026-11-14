// Conservative OCR cleanup. It only removes things that are clearly not text (bullet marks read
// as letters, stray symbols, junk lines). Real-looking words are NEVER deleted: doubtful ones are
// flagged so the user can check them. The untouched scan stays available as `raw`.
const BULLET_TOKENS = new Set(['o', 'e', 'eo', 'oo', '©', '®', '•', '·', '*', '+', '~', '»', '>', '°']);
const HAS_ALNUM = /[A-Za-z0-9]/;
export const FLAG_BELOW = 60;
// Punctuation that carries meaning when it sits between words (e.g. "1:00 pm - 3:00 pm").
const KEEP_MID_SYMBOLS = new Set(['-', '–', '—', '&', '/', '%', '$', '#', '@', '(', ')', '=']);
// Short words that are real, so a trailing "to" or "of" is never mistaken for noise.
const SHORT_WORDS = new Set(['a', 'am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of', 'oh', 'on', 'or', 'pm', 'so', 'to', 'up', 'us', 'we', 'ok', 'tv', 'id']);

function stripLeadingSymbols(text) {
  // "~All" -> "All" (a bullet glued to the first word)
  const m = text.match(/^[~_|`^©®•·*+»°]+(?=[A-Za-z0-9])/);
  return m ? text.slice(m[0].length) : text;
}

/**
 * lines: [{ text, confidence, words: [{ text, confidence }] }]
 * Returns { text, uncorrectedText, corrections, removed: [{ text, reason }], flagged: [...] }
 */
export function cleanLines(lines, { fix, isWord } = {}) {
  const gaps = []; // unreadable text we dropped: reported so the user can retake, never hidden
  const out = [];
  const plain = []; // same lines without spell-fixes, so corrections can be undone
  const corrections = [];
  const removed = [];
  const flagged = [];
  for (const line of lines) {
    const words = (line.words ?? []).map((w) => ({ text: w.text, confidence: w.confidence ?? 100 }));
    if (!words.length && line.text?.trim()) words.push(...line.text.trim().split(/\s+/).map((t) => ({ text: t, confidence: 100 })));
    if (!words.length) continue;

    const lineText = words.map((w) => w.text).join(' ');
    const alnum = (lineText.match(/[A-Za-z0-9]/g) ?? []).length;
    if (!alnum || (line.confidence < 40 && alnum < 4)) {
      removed.push({ text: lineText, reason: 'stray marks' });
      continue;
    }

    let kept = words.slice();
    if (kept.length > 1 && BULLET_TOKENS.has(kept[0].text)) {
      removed.push({ text: kept[0].text, reason: 'bullet' });
      kept = kept.slice(1);
    }
    kept = kept.filter((w, i) => {
      if (HAS_ALNUM.test(w.text)) return true;
      const mid = i < kept.length - 1 && i > 0;
      if (mid && KEEP_MID_SYMBOLS.has(w.text)) return true;
      if (w.confidence < 85) { removed.push({ text: w.text, reason: 'stray mark' }); return false; }
      return true;
    });
    // A very short, low-confidence fragment at the very end of a line is usually page edge noise.
    const last = kept[kept.length - 1];
    if (kept.length > 2 && last) {
      const letters = last.text.replace(/[^A-Za-z]/g, '');
      const onlyLetters = letters.length === last.text.replace(/[^A-Za-z0-9]/g, '').length;
      if (letters.length > 0 && letters.length <= 2 && onlyLetters && last.confidence < 55
        && !SHORT_WORDS.has(letters.toLowerCase()) && letters !== 'I') {
        removed.push({ text: last.text, reason: 'edge noise' });
        kept = kept.slice(0, -1);
      }
    }
    if (kept.length) kept[0] = { ...kept[0], text: stripLeadingSymbols(kept[0].text) };
    if (!kept.length) continue;

    // A short run of non-words read with low confidence is smudge/edge noise ("ope -", "p Je s").
    if (isWord && isNoiseLine(kept, isWord)) {
      const dropped = kept.map((w) => w.text).join(' ');
      removed.push({ text: dropped, reason: 'unreadable' });
      gaps.push({ line: out.length + 1, text: dropped });
      continue;
    }

    plain.push(kept.map((w) => w.text).join(' '));
    if (fix) {
      const r = fix(kept);
      kept = r.tokens;
      r.corrections.forEach((c) => corrections.push({ ...c, line: out.length + 1 }));
    }
    out.push(kept.map((w) => w.text).join(' '));
    const lineNo = out.length;
    for (const w of kept) {
      if (!w.corrected && HAS_ALNUM.test(w.text) && w.confidence < FLAG_BELOW) {
        flagged.push({ word: w.text.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '') || w.text, line: lineNo, confidence: Math.round(w.confidence) });
      }
    }
  }
  return { text: out.join('\n'), uncorrectedText: plain.join('\n'), corrections, gaps, removed, flagged, lineCount: out.length };
}

const WORDISH = /[A-Za-z]+/g;
function isNoiseLine(tokens, isWord) {
  const text = tokens.map((t) => t.text).join(' ');
  if (/[0-9]/.test(text)) return false; // numbers, times, URLs: keep and let the user judge
  const cores = text.match(WORDISH) ?? [];
  if (!cores.length) return false;
  const letters = cores.join('').length;
  const valid = cores.filter((c) => isWord(c.toLowerCase())).length;
  const avgConf = tokens.reduce((n, t) => n + t.confidence, 0) / tokens.length;
  // A single longer unknown word is more likely a name ("Qualcomm") than noise: keep and flag it.
  const looksLikeFragment = tokens.length >= 2 || letters <= 3;
  return looksLikeFragment && letters <= 14 && valid / cores.length < 0.34 && avgConf < 75;
}

// Pull lines/words out of a Tesseract result. Falls back to plain text lines.
export function linesFromData(data) {
  const lines = [];
  for (const block of data?.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        lines.push({
          text: line.text ?? '',
          confidence: line.confidence ?? 100,
          height: line.bbox ? line.bbox.y1 - line.bbox.y0 : null,
          words: (line.words ?? []).map((w) => ({ text: w.text, confidence: w.confidence })),
        });
      }
    }
  }
  if (lines.length) return lines;
  return (data?.text ?? '').split('\n').filter((l) => l.trim()).map((l) => ({ text: l, confidence: 100, words: [] }));
}
