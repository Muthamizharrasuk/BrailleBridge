import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TextFeature from './TextFeature.jsx';

const translation = { braille_unicode: '⠓⠑⠇⠏', cells: [19, 17, 7, 15], pages: [[19, 17, 7], [15, 0, 0]], cell_count: 4 };

describe('TextFeature UNO Q simplification', () => {
  it('preserves the original, allows editing, and translates only the approved draft', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/ai/status') return { ok: true, json: async () => ({ connected: true, state: 'connected' }) };
      if (url === '/api/ai/simplify') return { ok: true, json: async () => ({ simplified: 'Please help.' }) };
      if (url === '/api/braille/translate') return { ok: true, json: async () => translation };
      if (url === '/api/hardware/status') return { ok: true, json: async () => ({ state: 'simulation', connected: false }) };
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<TextFeature grade={1} />);
    const original = screen.getByLabelText('Your text');
    await user.type(original, 'Please provide assistance.');
    await user.click(screen.getByRole('button', { name: /^Simplify with UNO Q AI$/i }));
    const draft = await screen.findByLabelText(/UNO Q simplified draft/i);
    expect(original).toHaveValue('Please provide assistance.');
    expect(draft).toHaveValue('Please help.');
    await user.clear(draft); await user.type(draft, 'Help.');
    await user.click(screen.getByRole('button', { name: /translate approved simplified text/i }));
    await screen.findByRole('heading', { name: /translation preview/i });
    const translationCall = fetchMock.mock.calls.find(([url]) => url === '/api/braille/translate');
    expect(JSON.parse(translationCall[1].body).text).toBe('Help.');
    expect(original).toHaveValue('Please provide assistance.');
  });

  it('reports a timeout and keeps the original text', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => url === '/api/ai/status'
      ? { ok: true, json: async () => ({ connected: true }) }
      : { ok: false, status: 504, json: async () => ({ detail: 'UNO Q AI simplification timed out.' }) }));
    const user = userEvent.setup();
    render(<TextFeature grade={1} />);
    const original = screen.getByLabelText('Your text');
    await user.type(original, 'Keep this original.');
    await user.click(screen.getByRole('button', { name: /^Simplify with UNO Q AI$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/timed out.*original text is unchanged/i);
    expect(original).toHaveValue('Keep this original.');
    expect(screen.queryByLabelText(/UNO Q simplified draft/i)).not.toBeInTheDocument();
  });
});
