import { describe, expect, it, vi } from 'vitest';
import { evaluateCompression, requestCompression } from './compression.js';

describe('optional compression adapter', () => {
  it('sends the original unchanged and accepts a reviewable candidate', async () => {
    const text = '  Please call Ana at 8:30.\n';
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ original: text, text: 'Call Ana at 8:30.', status: 'candidate' }) });
    expect((await requestCompression(text, { fetchImpl })).status).toBe('candidate');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ text });
  });

  it.each(['http', 'network', 'invalid', 'fallback'])('uses the original on %s failure', async (failure) => {
    const text = 'Do NOT call Ana at 8:30.';
    const fetchImpl = async () => {
      if (failure === 'network') throw new TypeError('Disconnected');
      return { ok: failure !== 'http', json: async () => failure === 'fallback'
        ? { original: text, text: 'MUST NOT USE THIS', status: 'fallback' }
        : { original: 'wrong text', text: 'Hi', status: 'candidate' } };
    };
    expect(await requestCompression(text, { fetchImpl })).toMatchObject({ text, original: text, status: 'fallback' });
  });

  it('uses actual Braille counts and the shared contract modes', async () => {
    const translate = vi.fn().mockResolvedValueOnce({ cell_count: 20 }).mockResolvedValueOnce({ cell_count: 15 });
    expect(await evaluateCompression('Original', 'Short', translate)).toMatchObject({ originalCount: 20, compressedCount: 15, reduction: 25 });
    expect(translate.mock.calls.map(([, options]) => options.mode)).toEqual(['verbatim', 'compressed']);
  });

  it('reports increased cell counts and partial API failure without inventing a reduction', async () => {
    expect((await evaluateCompression('A', 'B', vi.fn().mockResolvedValueOnce({ cell_count: 10 }).mockResolvedValueOnce({ cell_count: 12 }))).reduction).toBe(-20);
    expect(await evaluateCompression('A', 'B', vi.fn().mockResolvedValueOnce({ cell_count: 10 }).mockRejectedValueOnce(new Error('503')))).toMatchObject({ originalCount: 10, compressedCount: null, reduction: null });
  });
});
