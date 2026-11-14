import { describe, expect, it, vi } from 'vitest';
import { makeSpeechRequest, translateSpeech, validateTranslation } from './client.js';
import { translateDemoSpeech } from './fixtures.js';

const response = { braille_unicode: '\u2813\u2811\u2807\u2807\u2815', cells: [19, 17, 7, 7, 21], pages: [[19, 17, 7], [7, 21, 0]], cell_count: 5 };

describe('shared Braille API client', () => {
  it('retains every capitalization, number, and letter indicator returned by the engine', async () => {
    const indicators = { braille_unicode: '\u2820\u2801\u283c\u2801\u2830\u2803', cells: [32, 1, 60, 1, 48, 3], pages: [[32, 1, 60], [1, 48, 3]], cell_count: 6 };
    const result = await translateSpeech('A1b', { fetchImpl: async () => ({ ok: true, json: async () => indicators }) });
    expect(result).toBe(indicators);
    expect(result.pages.flat()).toEqual([32, 1, 60, 1, 48, 3]);
  });
  it('preserves the transcript exactly and follows the speech request contract', async () => {
    const text = '  Do NOT call Ana until 8:30.\n';
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => response });
    expect(await translateSpeech(text, { fetchImpl })).toEqual(response);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/braille/translate');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(options.body)).toEqual({ source: 'speech', text, mode: 'verbatim', grade: 1 });
  });

  it('supports a configured endpoint, compressed mode, and grade 2', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => response });
    await translateSpeech('Hi', { endpoint: 'http://localhost:8000/api/braille/translate', mode: 'compressed', grade: 2, fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:8000/api/braille/translate');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ source: 'speech', text: 'Hi', mode: 'compressed', grade: 2 });
  });

  it.each(['', '  \n'])('rejects an empty message before making a network call', async (text) => {
    const fetchImpl = vi.fn();
    await expect(translateSpeech(text, { fetchImpl })).rejects.toThrow('Enter or record');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects unsupported request options', () => {
    expect(() => makeSpeechRequest('Hi', 'concise')).toThrow('mode');
    expect(() => makeSpeechRequest('Hi', 'verbatim', 3)).toThrow('grade');
  });

  it('reports HTTP errors without substituting fixture data', async () => {
    await expect(translateSpeech('Hello', { fetchImpl: async () => ({ ok: false, status: 503 }) })).rejects.toThrow('HTTP 503');
  });

  it('explains connection failures and non-JSON responses', async () => {
    await expect(translateSpeech('Hi', { fetchImpl: async () => { throw new TypeError('fetch failed'); } })).rejects.toThrow('Cannot reach');
    await expect(translateSpeech('Hi', { fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError(); } }) })).rejects.toThrow('valid JSON');
  });

  it.each([
    { ...response, cells: [64] },
    { ...response, cell_count: 4 },
    { ...response, pages: [[19, 17, 7], [7, 21]] },
    { ...response, pages: [[19, 17, 7]] },
    { ...response, pages: [[19, 17, 7], [7, 21, 1]] },
    { ...response, pages: [[19, 0, 7], [7, 21, 0]] },
    { ...response, braille_unicode: null },
  ])('rejects malformed masks, counts, page layouts, or padding', (data) => {
    expect(() => validateTranslation(data)).toThrow('Braille API');
  });

  it('accepts legitimate blank cells and an empty translation response', () => {
    expect(validateTranslation({ braille_unicode: '\u2800', cells: [0], pages: [[0, 0, 0]], cell_count: 1 }).cell_count).toBe(1);
    expect(validateTranslation({ braille_unicode: '', cells: [], pages: [], cell_count: 0 }).pages).toEqual([]);
  });

  it('times out an unresponsive request', async () => {
    vi.useFakeTimers();
    try {
      const pending = translateSpeech('Hi', { timeoutMs: 20, fetchImpl: (_, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }) });
      const check = expect(pending).rejects.toThrow('too long');
      await vi.advanceTimersByTimeAsync(21);
      await check;
    } finally { vi.useRealTimers(); }
  });

  it('forwards cancellation to the network request', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = translateSpeech('Hi', { signal: controller.signal, fetchImpl });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  });
});

describe('clearly labeled static demo fixtures', () => {
  it('preserves capital indicators in independent static fixture copies', async () => {
    const first = await translateDemoSpeech('Hello');
    expect(first.cells).toEqual([32, 19, 17, 7, 7, 21]);
    first.cells[0] = 0;
    expect((await translateDemoSpeech('Hello')).cells[0]).toBe(32);
    expect((await translateDemoSpeech('Hi')).pages).toEqual([[32, 19, 10]]);
  });

  it('rejects arbitrary messages and unsupported fixture modes', async () => {
    await expect(translateDemoSpeech('Other text')).rejects.toThrow('Demo fixtures');
    await expect(translateDemoSpeech('Hello.')).rejects.toThrow('exact messages');
    await expect(translateDemoSpeech('Hello', { grade: 2 })).rejects.toThrow('Grade 1');
  });
});
