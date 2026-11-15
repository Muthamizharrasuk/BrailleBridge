import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

const result = { braille_unicode: '⠁⠃⠉⠙', cells: [1, 3, 9, 25], pages: [[1, 3, 9], [25, 0, 0]], cell_count: 4 };

beforeEach(() => {
  window.location.hash = '#home';
  vi.stubGlobal('scrollTo', vi.fn());
});

describe('unified app shell', () => {
  it('presents four honest feature cards and simulated hardware status', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /words in/i })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.queryByText('Document import is planned.', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText(/No physical Braille display or Arduino is connected/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveAttribute('href', '#main-content');
  });

  it('labels the missing document importer accurately', async () => {
    render(<App />);
    window.location.hash = '#document'; fireEvent(window, new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('heading', { name: /document import is planned/i })).toBeInTheDocument();
    expect(screen.getByText(/does not yet contain a PDF/i)).toBeInTheDocument();
  });

  it('translates Grade 2 text and navigates three-cell Braille pages', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await user.click(screen.getByLabelText('Grade 2'));
    window.location.hash = '#text'; fireEvent(window, new HashChangeEvent('hashchange'));
    await user.type(await screen.findByLabelText('Your text'), 'abcd');
    await user.click(screen.getByRole('button', { name: /translate to braille/i }));
    await screen.findByRole('heading', { name: /translation preview/i });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ source: 'text', grade: 2, text: 'abcd' });
    expect(screen.getByText(/Braille page 1 of 2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next braille page/i }));
    expect(screen.getByText(/Braille page 2 of 2/)).toBeInTheDocument();
    expect(screen.getByText(/Physical Braille hardware is not connected/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Padding')).toHaveLength(2));
  });

  it('sends an editable speech transcript through the shared API', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    window.location.hash = '#speech'; fireEvent(window, new HashChangeEvent('hashchange'));
    const transcript = await screen.findByLabelText('Review transcript');
    await user.type(transcript, 'Spoken words');
    await user.click(screen.getByRole('button', { name: /translate to braille/i }));
    await screen.findByRole('heading', { name: /translation preview/i });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ source: 'speech', grade: 1, text: 'Spoken words' });
  });
});
