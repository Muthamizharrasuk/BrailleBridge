import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DocumentFeature from './DocumentFeature.jsx';

const documentResult = {
  name: 'book.pdf', kind: 'pdf', usedOcr: true,
  sections: [
    { id: 'page-1', label: 'Page 1', text: 'First page text', method: 'text' },
    { id: 'page-2', label: 'Page 2', text: 'Second scanned page', method: 'ocr' },
  ],
};
const braille = { braille_unicode: '⠁', cells: [1], pages: [[1, 0, 0]], cell_count: 1 };

describe('DocumentFeature', () => {
  it('uploads, announces extraction, edits, and navigates document pages', async () => {
    const user = userEvent.setup();
    const extractor = vi.fn().mockImplementation(async (_file, { onStatus }) => { onStatus('Reading PDF page 1 of 2.'); return documentResult; });
    render(<DocumentFeature grade={1} extractor={extractor} />);
    await user.upload(screen.getByLabelText(/upload PDF, TXT, or DOCX/i), new File(['pdf'], 'book.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/2 pages extracted, including OCR/i);
    const text = screen.getByLabelText(/Extracted text for Page 1/i);
    await user.type(text, ' edited');
    expect(text).toHaveValue('First page text edited');
    await user.click(screen.getByRole('button', { name: /next document section/i }));
    expect(screen.getByLabelText(/Extracted text for Page 2/i)).toHaveValue('Second scanned page');
    expect(screen.getByText(/Page 2 · 2 of 2 · OCR/)).toBeInTheDocument();
  });

  it('provides play, pause, resume, and stop controls', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', function Utterance(text) { this.text = text; });
    render(<DocumentFeature grade={1} extractor={vi.fn().mockResolvedValue(documentResult)} />);
    await user.upload(screen.getByLabelText(/upload PDF/i), new File(['pdf'], 'book.pdf', { type: 'application/pdf' }));
    await user.click(await screen.findByRole('button', { name: /read aloud/i }));
    await user.click(screen.getByRole('button', { name: /pause reading/i }));
    expect(screen.getByText(/Reading status: paused/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /resume reading/i }));
    expect(screen.getByRole('button', { name: /stop reading/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /stop reading/i }));
    expect(screen.getByRole('button', { name: /read aloud/i })).toBeInTheDocument();
  });

  it('sends the reviewed section through Grade 2 Liblouis translation', async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => braille });
    vi.stubGlobal('fetch', fetchImpl);
    render(<DocumentFeature grade={2} extractor={vi.fn().mockResolvedValue(documentResult)} />);
    await user.upload(screen.getByLabelText(/upload PDF/i), new File(['pdf'], 'book.pdf', { type: 'application/pdf' }));
    await user.click(await screen.findByRole('button', { name: /translate Page 1 to Braille/i }));
    await screen.findByRole('heading', { name: /translation preview/i });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ source: 'text', grade: 2, text: 'First page text' });
    expect(screen.getByText(/From document/)).toBeInTheDocument();
  });

  it('announces extraction errors without exposing an editor', async () => {
    const user = userEvent.setup();
    render(<DocumentFeature grade={1} extractor={vi.fn().mockRejectedValue(new Error('Unsupported file type.'))} />);
    const input = screen.getByLabelText(/upload PDF/i);
    const invalid = new File(['x'], 'bad.pdf', { type: 'application/pdf' });
    await user.upload(input, invalid);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported file type');
    expect(screen.queryByLabelText(/Extracted text/)).not.toBeInTheDocument();
  });
});
