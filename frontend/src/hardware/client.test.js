import { describe, expect, it, vi } from 'vitest';
import { getHardwareStatus, sendHardwarePage } from './client.js';

describe('hardware API client', () => {
  it('reads status and sends exactly three selected masks', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: 'connected', connected: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ response: 'Received: P,32,19,17' }) });
    vi.stubGlobal('fetch', fetchMock);
    expect((await getHardwareStatus()).connected).toBe(true);
    expect((await sendHardwarePage([32, 19, 17])).response).toMatch(/Received/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ cells: [32, 19, 17] });
  });

  it('surfaces backend hardware errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 423, json: async () => ({ detail: 'Serial port is busy' }) }));
    await expect(sendHardwarePage([1, 2, 3])).rejects.toThrow(/busy/);
  });
});
