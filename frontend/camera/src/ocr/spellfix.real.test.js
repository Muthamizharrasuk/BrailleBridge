// Runs the fixer against the REAL bundled word lists to catch false corrections.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadDictionary, makeFixer } from './spellfix.js';

let fix;
beforeAll(async () => { fix = makeFixer(await loadDictionary()); });
const tok = (text, confidence) => ({ text, confidence });
const run = (...t) => fix(t.map(([x, c]) => tok(x, c)));

describe('spell fix with the real dictionary', () => {
  it('loads a large dictionary', async () => {
    const d = await loadDictionary();
    expect(d.common.size).toBeGreaterThan(40000);
    expect(d.valid.size).toBeGreaterThan(d.common.size);
  });
  it('fixes the doubled-letter split from the demo page', () => {
    const r = run(['more', 90], ['informati', 70], ['ion', 60]);
    expect(r.tokens.map((t) => t.text)).toEqual(['more', 'information']);
  });
  it('fixes a single misread letter', () => {
    expect(run(['speciflc', 40]).tokens[0].text).toBe('specific');
  });
  it('never touches names, brands, URLs or numbers, even at very low confidence', () => {
    for (const w of ['Qualcomm', 'Databricks', 'Devpost', 'MadHacks', 'TDS', 'madhacks.io/devpost', '1570', '12:00', 'N+1', 'Institute']) {
      expect(run(['the', 90], [w, 5]).corrections, w).toEqual([]);
    }
  });
  it('does not change ordinary real words at low confidence', () => {
    const sentence = 'The first round of judging will be the traditional science fair style and we will use this to pick our top projects';
    const r = fix(sentence.split(' ').map((w) => tok(w, 20)));
    expect(r.corrections).toEqual([]);
  });
  it('does not turn clipped line endings into other words', () => {
    expect(run(['to', 92], ['pic', 40]).corrections).toEqual([]);
    // "roun" has several neighbours (round, roan, ...): the safe answer is to leave it for the user.
    const out = run(['first', 95], ['roun', 40]).tokens[1].text;
    expect(['roun', 'round']).toContain(out);
  });
});
