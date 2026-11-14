import { describe, expect, it } from 'vitest';
import { cleanLines, linesFromData } from './cleanup.js';

const L = (confidence, ...words) => ({ confidence, text: words.map((w) => w[0]).join(' '), words: words.map(([text, c]) => ({ text, confidence: c })) });

describe('cleanLines', () => {
  it('removes bullet marks read as letters/symbols but keeps the sentence', () => {
    const r = cleanLines([
      L(72, ['eo', 62], ['The', 94], ['deadline', 96]),
      L(79, ['©', 71], ['You', 74], ['must', 95]),
      L(73, ['o', 50], ['Judging', 86]),
      L(86, ['e', 49], ['There', 85], ['will', 95]),
    ]);
    expect(r.text).toBe('The deadline\nYou must\nJudging\nThere will');
    expect(r.removed.map((x) => x.text)).toEqual(['eo', '©', 'o', 'e']);
  });
  it('drops junk lines with low confidence and almost no letters', () => {
    const r = cleanLines([L(24, ['N', 1], ["'", 48]), L(94, ['Hello', 95])]);
    expect(r.text).toBe('Hello');
    expect(r.removed[0].reason).toBe('stray marks');
  });
  it('drops punctuation-only tokens but keeps real words', () => {
    const r = cleanLines([L(60, ['top', 96], ['Six', 39], [':', 0])]);
    expect(r.text).toBe('top Six');
  });
  it('strips a symbol glued to the first word', () => {
    expect(cleanLines([L(91, ['~All', 45], ['projects', 96])]).text).toBe('All projects');
  });
  it('never deletes a real word, even at confidence 0 (e.g. "pm")', () => {
    const r = cleanLines([L(80, ['12:00', 96], ['pm', 0], ['Sunday,', 91])]);
    expect(r.text).toBe('12:00 pm Sunday,');
    expect(r.flagged).toEqual([{ word: 'pm', line: 1, confidence: 0 }]);
  });
  it('flags doubtful words with their line number', () => {
    const r = cleanLines([L(90, ['Fine', 96]), L(70, ['madhacksio/devpos', 8], ['ok', 90])]);
    expect(r.flagged).toEqual([{ word: 'madhacksio/devpos', line: 2, confidence: 8 }]);
  });
  it('keeps a lone legitimate single-letter word and numbers', () => {
    expect(cleanLines([L(90, ['a', 90], ['cat', 95])]).text).toBe('a cat'); // not in the bullet set when... see below
  });
  it('keeps text intact when it is just one bullet-like word on a line', () => {
    expect(cleanLines([L(90, ['o', 90])]).text).toBe('o');
  });
  it('falls back to plain lines when there is no word data', () => {
    const lines = linesFromData({ text: 'Hello world\n\nBye\n' });
    expect(cleanLines(lines).text).toBe('Hello world\nBye');
  });
  it('reads Tesseract blocks into lines', () => {
    const data = { blocks: [{ paragraphs: [{ lines: [{ text: 'Hi', confidence: 90, words: [{ text: 'Hi', confidence: 90 }] }] }] }] };
    expect(linesFromData(data)).toHaveLength(1);
  });
});

describe('noise lines', () => {
  const isWord = (w) => ['the', 'cat', 'sat', 'mats', 'overview', 'attendees'].includes(w);
  it('drops short non-word fragments read with low confidence and reports them as gaps', () => {
    const lines = [L(90, ['Hello', 95]), L(60, ['ope', 40], ['-', 30]), L(55, ['p', 30], ['Je', 50], ['s', 40]), L(90, ['The', 90], ['cat', 95])];
    const r = cleanLines(lines, { isWord });
    expect(r.text).toBe('Hello\nThe cat');
    expect(r.gaps.map((g) => g.text)).toEqual(['ope', 'p Je']);
  });
  it('keeps short real lines, names and numbers', () => {
    const lines = [L(95, ['For', 90], ['Attendees', 95]), L(70, ['MH', 60], ['1570', 50]), L(60, ['Qualcomm', 50])];
    const r = cleanLines(lines, { isWord });
    expect(r.text).toBe('For Attendees\nMH 1570\nQualcomm');
    expect(r.flagged.map((f) => f.word)).toContain('Qualcomm');
  });
  it('does nothing without a dictionary', () => {
    expect(cleanLines([L(60, ['ope', 40])]).gaps).toEqual([]);
  });
});
