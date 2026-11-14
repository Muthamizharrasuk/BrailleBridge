import { describe, expect, it } from 'vitest';
import { buildReport } from './report.js';

describe('buildReport', () => {
  it('is only "reliable" with high confidence and nothing doubtful', () => {
    const r = buildReport({ confidence: 92, lineCount: 10 });
    expect(r.level).toBe('reliable');
    expect(r.spoken).toMatch(/confident in all of it/);
  });
  it('is cautious and names the doubtful words with line numbers', () => {
    const r = buildReport({ confidence: 90, lineCount: 3, flagged: [{ word: 'pic', line: 12, confidence: 30 }] });
    expect(r.level).toBe('caution');
    expect(r.spoken).toMatch(/“pic” on line 12/);
  });
  it('reports missing text and recommends a retake when several gaps exist', () => {
    const r = buildReport({ confidence: 88, lineCount: 20, gaps: [{ line: 2 }, { line: 9 }, { line: 14 }] });
    expect(r.level).toBe('unreliable');
    expect(r.retake).toBe(true);
    expect(r.spoken).toMatch(/near lines 2, 9, 14/);
  });
  it('flags tiny writing and says to move closer', () => {
    const r = buildReport({ confidence: 90, lineCount: 5, textHeightPx: 8 });
    expect(r.level).toBe('unreliable');
    expect(r.spoken).toMatch(/Move closer/);
  });
  it('treats low OCR confidence as unreliable', () => {
    expect(buildReport({ confidence: 30, lineCount: 1 }).level).toBe('unreliable');
  });
  it('mentions fixes it made', () => {
    const r = buildReport({ confidence: 90, lineCount: 1, corrections: [{ from: 'speciflc', to: 'specific' }] });
    expect(r.spoken).toMatch(/“speciflc” became “specific”/);
  });
  it('caps long lists of doubtful words', () => {
    const flagged = Array.from({ length: 4 }, (_, i) => ({ word: `w${i}`, line: i + 1 }));
    expect(buildReport({ confidence: 90, lineCount: 9, flagged }).spoken).toMatch(/w3/);
    const many = Array.from({ length: 8 }, (_, i) => ({ word: `w${i}`, line: i + 1 }));
    expect(buildReport({ confidence: 90, lineCount: 9, flagged: many }).spoken).toMatch(/and 3 more/);
  });
});
