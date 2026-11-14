import { describe, expect, it, vi } from 'vitest';
import { describeConfidence, recognizeBest } from './ocr.js';

const rec = (...results) => {
  const fn = vi.fn();
  results.forEach((r) => fn.mockImplementationOnce(async () => (r instanceof Error ? Promise.reject(r) : { data: r })));
  return fn;
};
const tools = () => ({
  enhance: vi.fn(async () => 'enhanced'),
  rotate: vi.fn(async (_i, deg) => `rot${deg}`),
});

describe('recognizeBest', () => {
  it('stops after one pass when confidence is good', async () => {
    const r = rec({ text: 'Hello', confidence: 90 });
    const out = await recognizeBest('orig', { recognizeImpl: r, tools: tools() });
    expect(out).toMatchObject({ text: 'Hello', confidence: 90, attempts: 1 });
    expect(r.mock.calls[0][0]).toBe('enhanced');
  });
  it('tries the original when the enhanced pass is mediocre and keeps the best', async () => {
    const r = rec({ text: 'Hel1o', confidence: 55 }, { text: 'Hello', confidence: 80 });
    const out = await recognizeBest('orig', { recognizeImpl: r, tools: tools() });
    expect(out).toMatchObject({ text: 'Hello', confidence: 80, attempts: 2 });
    expect(r.mock.calls[1][0]).toBe('orig');
  });
  it('tries rotations when confidence is very low and picks the winner', async () => {
    const t = tools();
    const r = rec({ text: 'xx', confidence: 10 }, { text: 'yy', confidence: 12 },
      { text: 'junk', confidence: 20 }, { text: 'Hello there', confidence: 88 });
    const out = await recognizeBest('orig', { recognizeImpl: r, tools: t });
    expect(out).toMatchObject({ text: 'Hello there', confidence: 88 });
    expect(t.rotate.mock.calls.map((c) => c[1])).toEqual([90, 180]);
  });
  it('reports progress status labels', async () => {
    const onStatus = vi.fn();
    await recognizeBest('o', { recognizeImpl: rec({ text: 'a', confidence: 90 }), tools: tools(), onStatus });
    expect(onStatus).toHaveBeenCalledWith('Reading the page…');
  });
  it('falls back to the original if enhancement fails', async () => {
    const t = { ...tools(), enhance: vi.fn().mockRejectedValue(new Error('x')) };
    const r = rec({ text: 'Hi', confidence: 90 });
    await recognizeBest('orig', { recognizeImpl: r, tools: t });
    expect(r.mock.calls[0][0]).toBe('orig');
  });
  it('says so when nothing is found', async () => {
    const r = vi.fn().mockResolvedValue({ data: { text: ' ', confidence: 0 } });
    await expect(recognizeBest('o', { recognizeImpl: r })).rejects.toThrow(/No text was found/);
  });
  it('surfaces an engine failure on a single attempt', async () => {
    await expect(recognizeBest('o', { recognizeImpl: rec(new Error('worker died')) })).rejects.toThrow(/worker died/);
  });
});

it('also rotates when confidence is middling (sideways text reads as ~50%)', async () => {
  const t = tools();
  const r = rec({ text: 'garbage', confidence: 51 }, { text: 'garbage2', confidence: 50 }, { text: 'The real text', confidence: 93 });
  const out = await recognizeBest('orig', { recognizeImpl: r, tools: t });
  expect(out.text).toBe('The real text');
  expect(t.rotate).toHaveBeenCalledWith('enhanced', 90);
});

describe('describeConfidence', () => {
  it.each([[90, 'good'], [50, 'fair'], [10, 'poor']])('%i -> %s', (c, level) => {
    expect(describeConfidence(c).level).toBe(level);
  });
});
