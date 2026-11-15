import { describe, expect, it, vi } from 'vitest';
import { getLocalAIStatus, simplifyWithLocalAI } from './client.js';

describe('UNO Q local AI client', () => {
  it('checks status and sends text to the local proxy', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ connected: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ simplified: 'Short text.' }) });
    vi.stubGlobal('fetch', fetchMock);
    expect((await getLocalAIStatus()).connected).toBe(true);
    expect(await simplifyWithLocalAI('Long original text.')).toBe('Short text.');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ text: 'Long original text.' });
  });

  it('reports proxy errors without losing the submitted text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 504, json: async () => ({ detail: 'UNO Q timed out.' }) }));
    await expect(simplifyWithLocalAI('Keep me')).rejects.toThrow(/timed out/);
  });
});
