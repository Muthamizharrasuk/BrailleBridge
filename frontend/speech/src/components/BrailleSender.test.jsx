import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BrailleSender from './BrailleSender.jsx';

describe('Braille sending and preview', () => {
  function braille(count) {
    const cells = Array(count).fill(1);
    const pages = Array.from({ length: Math.ceil(count / 3) }, (_, page) => [0, 1, 2].map((index) => cells[page * 3 + index] ?? 0));
    return { cells, pages, cell_count: count, braille_unicode: '\u2801'.repeat(count) };
  }

  it('requires approval, compares actual cells, and sends approved text in compressed mode', async () => {
    const original = 'Please do not call Ana at 8:30.';
    const candidate = 'Do not call Ana at 8:30.';
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, ...body });
      return { ok: true, json: async () => url === '/api/speech/compress'
        ? { status: 'candidate', original, text: candidate }
        : braille(body.text === original ? 30 : 24) };
    }));
    const user = userEvent.setup();
    render(<BrailleSender text={original} listening={false} onUseSample={() => {}} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Translation source' }), 'real');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Message mode' }), 'compressed');
    await user.click(screen.getByRole('button', { name: 'Suggest concise version' }));
    expect(await screen.findByText('Braille cell reduction: 20.0%.')).toBeVisible();
    expect(screen.getByText(/Will send: original transcript unchanged/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Send to Braille' }));
    expect(calls.at(-1)).toMatchObject({ text: original, mode: 'verbatim' });
    await user.click(screen.getByRole('button', { name: 'Approve concise text' }));
    await user.click(screen.getByRole('button', { name: 'Send to Braille' }));
    expect(calls.at(-1)).toMatchObject({ source: 'speech', text: candidate, mode: 'compressed', grade: 1 });
    expect(await screen.findByText('Sent mode: compressed')).toBeVisible();
  });

  it('falls back to original verbatim text when the compression service fails', async () => {
    const original = 'Do NOT call Ana at 8:30.';
    const calls = [];
    vi.stubGlobal('fetch', async (url, options) => {
      calls.push(JSON.parse(options.body));
      return { ok: url !== '/api/speech/compress', status: 503, json: async () => braille(6) };
    });
    const user = userEvent.setup();
    render(<BrailleSender text={original} listening={false} onUseSample={() => {}} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Translation source' }), 'real');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Message mode' }), 'compressed');
    await user.click(screen.getByRole('button', { name: 'Suggest concise version' }));
    expect(await screen.findByText(/Compression is unavailable/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Send to Braille' }));
    expect(calls.at(-1)).toEqual({ source: 'speech', text: original, mode: 'verbatim', grade: 1 });
  });

  it('keeps the original selected when concise text saves no Braille cells', async () => {
    vi.stubGlobal('fetch', async (url) => ({ ok: true, json: async () => url === '/api/speech/compress'
      ? { status: 'candidate', original: 'Please call Ana.', text: 'Call Ana.' } : braille(6) }));
    const user = userEvent.setup();
    render(<BrailleSender text="Please call Ana." listening={false} onUseSample={() => {}} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Translation source' }), 'real');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Message mode' }), 'compressed');
    await user.click(screen.getByRole('button', { name: 'Suggest concise version' }));
    expect(await screen.findByText('No Braille cells saved. Keep the original message.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Approve concise text' })).toBeDisabled();
    expect(screen.getByText(/Will send: original transcript unchanged/)).toBeVisible();
  });

  it('switches from mock output to real responses without keeping stale fixtures', async () => {
    const data = { braille_unicode: '\u2820\u2801\u283c', cells: [32, 1, 60], pages: [[32, 1, 60]], cell_count: 3 };
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => data }));
    const user = userEvent.setup();
    render(<BrailleSender text="Hello" listening={false} onUseSample={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Send to Braille' }));
    expect(await screen.findByText('Demo fixture', { exact: true })).toBeVisible();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Translation source' }), 'real');
    expect(screen.queryByText('Demo fixture', { exact: true })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send to Braille' }));
    expect(await screen.findByText('API response', { exact: true })).toBeVisible();
    expect(screen.getByText('Mask 32')).toBeVisible();
    expect(screen.getByText('Mask 60')).toBeVisible();
  });
  it('blocks blank and unfinished transcripts and offers explicitly labeled samples', async () => {
    const user = userEvent.setup();
    const onUseSample = vi.fn();
    const { rerender } = render(<BrailleSender text="  " listening={false} onUseSample={onUseSample} />);
    expect(screen.getByRole('button', { name: 'Send to Braille' })).toBeDisabled();
    expect(screen.getByText('Demo data only.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Use sample: Hello' }));
    expect(onUseSample).toHaveBeenCalledWith('Hello');
    rerender(<BrailleSender text="Hello" listening onUseSample={onUseSample} />);
    expect(screen.getByRole('button', { name: 'Send to Braille' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Use sample: Hi' })).toBeDisabled();
  });

  it('previews three-cell pages and distinguishes final padding from content', async () => {
    const user = userEvent.setup();
    render(<BrailleSender text="Hello" listening={false} onUseSample={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Send to Braille' }));
    expect(await screen.findByRole('heading', { name: 'Braille preview' })).toBeVisible();
    expect(screen.getByText('6 Braille cells · 2 three-cell pages · Grade 1')).toBeVisible();
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.getByRole('img', { name: 'Dots 1, 2, 5' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 2 of 2')).toBeVisible();
    expect(screen.queryByRole('img', { name: 'Padding cell' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(screen.getByText('Page 1 of 2')).toBeVisible();
  });

  it('clears an outdated preview when the transcript changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BrailleSender text="Hello" listening={false} onUseSample={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Send to Braille' }));
    await screen.findByRole('heading', { name: 'Braille preview' });
    rerender(<BrailleSender text="Hi" listening={false} onUseSample={() => {}} />);
    expect(screen.queryByRole('heading', { name: 'Braille preview' })).not.toBeInTheDocument();
  });

  it('reports unsupported demo text without showing a fake translation', async () => {
    const user = userEvent.setup();
    render(<BrailleSender text="A real conversation" listening={false} onUseSample={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Send to Braille' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Demo fixtures');
    expect(screen.queryByRole('heading', { name: 'Braille preview' })).not.toBeInTheDocument();
  });

  it('shows real API loading/errors and never falls back to a demo fixture', async () => {
    let resolve;
    const fetchImpl = vi.fn(() => new Promise((done) => { resolve = done; }));
    vi.stubGlobal('fetch', fetchImpl);
    const user = userEvent.setup();
    render(<BrailleSender text="Hello" listening={false} onUseSample={() => {}} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Translation source' }), 'real');
    await user.click(screen.getByRole('button', { name: 'Send to Braille' }));
    expect(screen.getByRole('status')).toHaveTextContent('Waiting');
    expect(screen.getByRole('button', { name: 'Translating...' })).toBeDisabled();
    await act(async () => resolve({ ok: false, status: 503 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 503');
    expect(screen.queryByRole('heading', { name: 'Braille preview' })).not.toBeInTheDocument();
  });

  it('cancels and ignores a stale response after editing', async () => {
    let resolve;
    const fetchImpl = vi.fn(() => new Promise((done) => { resolve = done; }));
    vi.stubGlobal('fetch', fetchImpl);
    const user = userEvent.setup();
    const { rerender } = render(<BrailleSender text="Hello" listening={false} onUseSample={() => {}} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Translation source' }), 'real');
    await user.click(screen.getByRole('button', { name: 'Send to Braille' }));
    rerender(<BrailleSender text="New message" listening={false} onUseSample={() => {}} />);
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => resolve({ ok: true, json: async () => ({ braille_unicode: '\u2813', cells: [19], pages: [[19, 0, 0]], cell_count: 1 }) }));
    expect(screen.queryByRole('heading', { name: 'Braille preview' })).not.toBeInTheDocument();
  });
});
