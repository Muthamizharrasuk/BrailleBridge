import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import UnifiedBraillePreview from './UnifiedBraillePreview.jsx';

const translation = { braille_unicode: '⠠⠓⠑', cells: [32, 19, 17], pages: [[32, 19, 17]], cell_count: 3 };

describe('UnifiedBraillePreview hardware controls', () => {
  it('sends the currently selected page and reports the Arduino response', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/hardware/status') return { ok: true, json: async () => ({ state: 'connected', connected: true, configured: true, port: '/dev/test' }) };
      if (url === '/api/hardware/page') return { ok: true, json: async () => ({ state: 'connected', response: 'Received: P,32,19,17', duplicate: false }) };
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<UnifiedBraillePreview translation={translation} text="Hello" grade={1} source="text" />);
    const send = await screen.findByRole('button', { name: /send selected page/i });
    expect(send).toBeEnabled();
    await user.click(send);
    expect(await screen.findByText(/Arduino replied: Received: P,32,19,17/i)).toBeInTheDocument();
    const request = fetchMock.mock.calls.find(([url]) => url === '/api/hardware/page');
    expect(JSON.parse(request[1].body)).toEqual({ cells: [32, 19, 17] });
  });

  it('disables physical sending in simulation mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ state: 'simulation', connected: false, configured: false, port: null }) }));
    render(<UnifiedBraillePreview translation={translation} text="Hello" grade={1} source="text" />);
    expect(await screen.findByText(/No serial port is configured/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send selected page/i })).toBeDisabled();
  });
});
