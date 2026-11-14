// A plain-language reliability report written to be SPOKEN. Blind users cannot see a
// "check these words" list or judge a photo, so the app must say what it is unsure of and
// whether to retake, and must never claim success it cannot back up.
export const SMALL_TEXT_PX = 12; // line height in the original photo below which OCR gets unreliable

const listWords = (items, max = 5) => {
  const shown = items.slice(0, max).map((f) => `“${f.word}” on line ${f.line}`);
  const more = items.length - shown.length;
  return shown.join(', ') + (more > 0 ? `, and ${more} more` : '');
};

export function buildReport({ confidence = 0, flagged = [], gaps = [], corrections = [], lineCount = 0, textHeightPx = null } = {}) {
  const tooSmall = textHeightPx != null && textHeightPx < SMALL_TEXT_PX;
  const gapCount = gaps.length;
  const unreliable = confidence < 45 || tooSmall || gapCount >= 3 || flagged.length >= 6;
  const caution = !unreliable && (flagged.length > 0 || gapCount > 0 || corrections.length > 0 || confidence < 85);
  const level = unreliable ? 'unreliable' : caution ? 'caution' : 'reliable';

  const parts = [`I read ${lineCount} line${lineCount === 1 ? '' : 's'}.`];
  if (level === 'reliable') parts.push('I am confident in all of it.');
  if (level === 'caution') parts.push('Most of it looks right, but I am not completely sure about everything.');
  if (level === 'unreliable') parts.push('I do not trust this reading. It probably has mistakes.');
  if (flagged.length) parts.push(`Words I am not sure about: ${listWords(flagged)}.`);
  if (corrections.length) parts.push(`I fixed ${corrections.length} likely misread word${corrections.length === 1 ? '' : 's'}: ${corrections.slice(0, 3).map((c) => `“${c.from}” became “${c.to}”`).join(', ')}.`);
  if (gapCount) parts.push(`I could not read some text near line${gapCount === 1 ? '' : 's'} ${gaps.slice(0, 4).map((g) => g.line).join(', ')}, so it is missing.`);
  if (tooSmall) parts.push('The writing is very small in the photo. Move closer to the page.');
  if (level !== 'reliable') {
    parts.push(level === 'unreliable'
      ? 'Please take another photo: hold the phone steady with the whole page in view and good light.'
      : 'You can listen to the text now, or take another photo to be sure.');
  }
  return { level, retake: level === 'unreliable', spoken: parts.join(' '), tooSmall };
}
