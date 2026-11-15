import { describe, expect, it, vi } from 'vitest';
import { makeCameraRequest, translateCamera } from './cameraClient.js';

const good = { braille_unicode: '⠁⠃⠉', cells: [1, 3, 9], pages: [[1, 3, 9]], cell_count: 3 };
const resp = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

describe('camera Braille client', () => {
  it('builds the contract request', () => {
    expect(makeCameraRequest('abc')).toEqual({ source: 'camera', text: 'abc', mode: 'verbatim', grade: 1 });
  });
  it('supports Grade 2 for the unified app', () => {
    expect(makeCameraRequest('abc', 2)).toEqual({ source: 'camera', text: 'abc', mode: 'verbatim', grade: 2 });
  });
  it('preserves text exactly and rejects blank text', () => {
    expect(makeCameraRequest(' a\nb ').text).toBe(' a\nb ');
    expect(() => makeCameraRequest('  \n')).toThrow(/no text/i);
  });
  it('posts to the translate endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(resp(good));
    await expect(translateCamera('abc', { fetchImpl })).resolves.toEqual(good);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/braille/translate');
    expect(JSON.parse(init.body)).toEqual({ source: 'camera', text: 'abc', mode: 'verbatim', grade: 1 });
  });
  it('reports HTTP errors with detail', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(resp({ detail: 'boom' }, false, 500));
    await expect(translateCamera('abc', { fetchImpl })).rejects.toThrow(/HTTP 500.*boom/);
  });
  it('reports an unreachable API', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(translateCamera('abc', { fetchImpl })).rejects.toThrow(/Cannot reach the Braille API/);
  });
  it('rejects responses that break the contract', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(resp({ ...good, cell_count: 9 }));
    await expect(translateCamera('abc', { fetchImpl })).rejects.toThrow(/invalid response/);
  });
});
