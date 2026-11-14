import { describe, expect, it } from 'vitest';
import { edits1, makeFixer } from './spellfix.js';
import { cleanLines } from './cleanup.js';

const words = ['information', 'about', 'specific', 'prizes', 'judging', 'place', 'plane', 'plate', 'ion', 'the', 'sunday', 'first', 'round', 'will', 'take'];
const dict = { common: new Set(words), valid: new Set([...words, 'rareword']) };
const fix = makeFixer(dict);
const tok = (text, confidence) => ({ text, confidence });

describe('edits1', () => {
  it('covers deletion, transposition, substitution and insertion', () => {
    const e = edits1('cat');
    ['at', 'act', 'cut', 'cart'].forEach((w) => expect(e.has(w)).toBe(true));
    expect(e.has('cat')).toBe(false);
  });
});

describe('spell fix', () => {
  it('fixes a low-confidence misread with exactly one candidate', () => {
    const r = fix([tok('speciflc', 40)]);
    expect(r.tokens[0].text).toBe('specific');
    expect(r.corrections).toEqual([{ from: 'speciflc', to: 'specific' }]);
  });
  it('does nothing when the word was read with high confidence', () => {
    expect(fix([tok('speciflc', 90)]).corrections).toEqual([]);
  });
  it('does nothing when several words are equally close (ambiguous)', () => {
    expect(fix([tok('plare', 30)]).corrections).toEqual([]); // place / plane / plate
  });
  it('never changes a real word, even a rare one, at low confidence', () => {
    expect(fix([tok('rareword', 10)]).corrections).toEqual([]);
    expect(fix([tok('about', 10)]).corrections).toEqual([]);
  });
  it('leaves short words, numbers, URLs and mixed tokens alone', () => {
    ['th', '1570', 'madhacks.io/devpost', 'sp3cific', 'N+1'].forEach((t) => expect(fix([tok(t, 10)]).corrections).toEqual([]));
  });
  it('leaves capitalized mid-line words (names) alone but fixes at line start', () => {
    expect(fix([tok('the', 90), tok('Speciflc', 30)]).corrections).toEqual([]);
    expect(fix([tok('Speciflc', 30)]).tokens[0].text).toBe('Specific');
  });
  it('keeps surrounding punctuation and capitalization style', () => {
    expect(fix([tok('(speciflc),', 30)]).tokens[0].text).toBe('(specific),');
    expect(fix([tok('SPECIFLC', 30)]).tokens[0].text).toBe('SPECIFIC');
  });
  it('rejoins split fragments into a real word', () => {
    const r = fix([tok('more', 90), tok('inform', 70), tok('ation', 60)]);
    expect(r.tokens.map((t) => t.text)).toEqual(['more', 'information']);
    expect(r.corrections[0]).toEqual({ from: 'inform ation', to: 'information' });
  });
  it('rejoins fragments that are one clear edit from a real word (doubled letter)', () => {
    const r = fix([tok('more', 90), tok('informati', 70), tok('ion', 60)]);
    expect(r.tokens.map((t) => t.text)).toEqual(['more', 'information']);
    expect(r.corrections[0]).toEqual({ from: 'informati ion', to: 'information' });
  });
  it('does not join unrelated fragments', () => {
    expect(fix([tok('foo', 50), tok('bar', 50)]).corrections).toEqual([]);
  });
  it('REGRESSION: never turns "to pic" (a clipped "pick") into "topic"', () => {
    const d = { common: new Set(['topic', 'to', 'pick']), valid: new Set(['topic', 'to', 'pick']) };
    expect(makeFixer(d)([tok('to', 92), tok('pic', 40)]).corrections).toEqual([]);
    expect(makeFixer(d)([tok('to', 50), tok('pic', 40)]).corrections).toEqual([]); // even if doubtful: "to" is a function word
  });
  it('does not join when only one fragment is doubtful', () => {
    expect(fix([tok('informati', 40), tok('ion', 92)]).corrections).toEqual([]);
  });
  it('does not join confidently-read fragments', () => {
    expect(fix([tok('informati', 95), tok('ion', 95)]).corrections).toEqual([]);
  });
  it('does not join two real words', () => {
    expect(fix([tok('about', 50), tok('place', 50)]).corrections).toEqual([]);
  });
});

describe('cleanLines with spell fix', () => {
  const lines = [{ confidence: 80, text: '', words: [tok('Find', 96), tok('more', 90), tok('informati', 70), tok('ion', 55), tok('about', 96), tok('speciflc', 40), tok('prizes', 96)] }];
  it('reports corrections with line numbers and keeps the uncorrected text for undo', () => {
    const r = cleanLines(lines, { fix });
    expect(r.text).toBe('Find more information about specific prizes');
    expect(r.uncorrectedText).toBe('Find more informati ion about speciflc prizes');
    expect(r.corrections.map((c) => c.line)).toEqual([1, 1]);
  });
  it('does not flag words that were corrected', () => {
    expect(cleanLines(lines, { fix }).flagged).toEqual([]);
  });
  it('behaves exactly as before without a fixer', () => {
    const r = cleanLines(lines);
    expect(r.text).toBe(r.uncorrectedText);
    expect(r.corrections).toEqual([]);
  });
});
