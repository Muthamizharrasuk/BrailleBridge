import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

const result = { braille_unicode: '⠁⠃⠉⠙', cells: [1, 3, 9, 25], pages: [[1, 3, 9], [25, 0, 0]], cell_count: 4 };

beforeEach(() => {
  window.location.hash = '#home';
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url === '/api/hardware/status') return { ok: true, json: async () => ({ state: 'simulation', configured: false, connected: false, port: null }) };
    throw new Error(`Unexpected request: ${url}`);
  }));
});

describe('unified app shell', () => {
  it('presents four honest feature cards and simulated hardware status', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /words in/i })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getAllByText('Available')).toHaveLength(4);
    expect(await screen.findByText(/No serial port is configured/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveAttribute('href', '#main-content');
  });

  it('opens the available private document importer', async () => {
    render(<App />);
    window.location.hash = '#document'; fireEvent(window, new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('heading', { name: /Open a document/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Upload PDF, TXT, or DOCX/i)).toBeInTheDocument();
    expect(screen.getByText(/not uploaded to a third-party/i)).toBeInTheDocument();
  });

  it('translates Grade 2 text and navigates three-cell Braille pages', async () => {
    const user = userEvent.setup();
    let displayPage = 1;
    const fetchMock = vi.fn(async (url) => {
      let data;
      if (url === '/api/hardware/status') {
        data = { state: 'simulation', configured: false, connected: false, port: null };
      } else if (url === '/api/display/load' || url === '/api/display/restart') {
        displayPage = 1;
      } else if (url === '/api/display/next') {
        displayPage = Math.min(2, displayPage + 1);
      } else if (url === '/api/display/previous') {
        displayPage = Math.max(1, displayPage - 1);
      } else if (url === '/api/braille/translate') {
        data = result;
      }

      if (url.startsWith('/api/display/')) {
        data = {
          page: displayPage,
          total: 2,
          cells: result.pages[displayPage - 1],
        };
      }
      if (!data) throw new Error(`Unexpected request: ${url}`);
      return { ok: true, json: async () => data };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await user.click(screen.getByLabelText('Grade 2'));
    window.location.hash = '#text'; fireEvent(window, new HashChangeEvent('hashchange'));
    await user.type(await screen.findByLabelText('Your text'), 'abcd');
    await user.click(screen.getByRole('button', { name: /translate to braille/i }));
    await screen.findByRole('heading', { name: /translation preview/i });
    const translationCall = fetchMock.mock.calls.find(([url]) => url === '/api/braille/translate');
    expect(JSON.parse(translationCall[1].body)).toMatchObject({ source: 'text', grade: 2, text: 'abcd' });
    expect(screen.getByText(/Braille page 1 of 2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next braille page/i }));
    await waitFor(() => expect(screen.getByText(/Braille page 2 of 2/)).toBeInTheDocument());
    expect(screen.getAllByText(/No serial port is configured/i).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getAllByText('Padding')).toHaveLength(2));
  });

  it('sends an editable speech transcript through the shared API', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url) => ({ ok: true, json: async () => url === '/api/hardware/status'
      ? { state: 'simulation', configured: false, connected: false, port: null } : result }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    window.location.hash = '#speech'; fireEvent(window, new HashChangeEvent('hashchange'));
    const transcript = await screen.findByLabelText('Review transcript');
    await user.type(transcript, 'Spoken words');
    await user.click(screen.getByRole('button', { name: /translate to braille/i }));
    await screen.findByRole('heading', { name: /translation preview/i });
    const translationCall = fetchMock.mock.calls.find(([url]) => url === '/api/braille/translate');
    expect(JSON.parse(translationCall[1].body)).toMatchObject({ source: 'speech', grade: 1, text: 'Spoken words' });
  });
});
