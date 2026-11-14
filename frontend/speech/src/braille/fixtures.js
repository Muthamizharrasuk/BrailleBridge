import { makeSpeechRequest, validateTranslation } from './client.js';

// Fixed test data only. This module intentionally cannot translate arbitrary text.
const fixtures = {
  Hello: { braille_unicode: '\u2820\u2813\u2811\u2807\u2807\u2815', cells: [32, 19, 17, 7, 7, 21], pages: [[32, 19, 17], [7, 7, 21]], cell_count: 6 },
  Hi: { braille_unicode: '\u2820\u2813\u280a', cells: [32, 19, 10], pages: [[32, 19, 10]], cell_count: 3 },
};

export const demoMessages = Object.keys(fixtures);

export async function translateDemoSpeech(text, { mode = 'verbatim', grade = 1, signal } = {}) {
  makeSpeechRequest(text, mode, grade);
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (mode !== 'verbatim' || grade !== 1 || !Object.hasOwn(fixtures, text)) {
    throw new Error('Demo fixtures support only the exact messages "Hello" and "Hi" in verbatim Grade 1. Use a sample or connect the real API for other text.');
  }
  return validateTranslation(structuredClone(fixtures[text]));
}
