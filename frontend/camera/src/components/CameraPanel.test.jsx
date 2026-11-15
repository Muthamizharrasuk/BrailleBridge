import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CameraPanel from './CameraPanel.jsx';
import { describeCameraError } from './webcamErrors.js';

const result = { braille_unicode: '⠁⠃⠉⠙', cells: [1, 3, 9, 25], pages: [[1, 3, 9], [25, 0, 0]], cell_count: 4 };
const png = () => new File(['x'], 'page.png', { type: 'image/png' });

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
});

describe('CameraPanel', () => {
  it('uploads, OCRs into an editable box, and translates the corrected text', async () => {
    const user = userEvent.setup();
    const ocr = vi.fn().mockResolvedValue('abcd');
    const translate = vi.fn().mockResolvedValue(result);
    render(<CameraPanel ocr={ocr} translate={translate} tools={{}} />);
    await user.upload(screen.getByLabelText('Upload image'), png());
    const box = await screen.findByDisplayValue('abcd');
    await user.clear(box);
    await user.type(box, 'abcd!');
    await user.click(screen.getByRole('button', { name: /translate to braille/i }));
    expect(translate).toHaveBeenCalledWith('abcd!');
    expect(await screen.findByText(/Page 1 of 2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
  });

  it('shows OCR failures and keeps typing available', async () => {
    const user = userEvent.setup();
    render(<CameraPanel ocr={vi.fn().mockRejectedValue(new Error('No text was found in the image.'))} translate={vi.fn()} tools={{}} />);
    await user.upload(screen.getByLabelText('Upload image'), png());
    expect(await screen.findByRole('alert')).toHaveTextContent('No text was found');
    await user.type(screen.getByLabelText(/check the text/i), 'hi');
    expect(screen.getByRole('button', { name: /translate to braille/i })).toBeEnabled();
  });

  it('shows API failures', async () => {
    const user = userEvent.setup();
    render(<CameraPanel ocr={vi.fn()} translate={vi.fn().mockRejectedValue(new Error('Cannot reach the Braille API.'))} />);
    await user.type(screen.getByLabelText(/check the text/i), 'hi');
    await user.click(screen.getByRole('button', { name: /translate to braille/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the Braille API');
  });

  it('passes Grade 2 through and reports unified output', async () => {
    const user = userEvent.setup();
    const translate = vi.fn().mockResolvedValue(result);
    const onTranslation = vi.fn();
    render(<CameraPanel ocr={vi.fn()} translate={translate} grade={2} showPreview={false} onTranslation={onTranslation} />);
    await user.type(screen.getByLabelText(/check the text/i), 'hi');
    await user.click(screen.getByRole('button', { name: /translate to braille/i }));
    await waitFor(() => expect(onTranslation).toHaveBeenCalled());
    expect(translate).toHaveBeenCalledWith('hi', { grade: 2 });
    expect(onTranslation).toHaveBeenCalledWith({ result, text: 'hi', grade: 2, source: 'camera' });
    expect(screen.queryByText(/Braille preview/)).not.toBeInTheDocument();
  });

  it('rejects non-image uploads without running OCR', async () => {
    const ocr = vi.fn();
    render(<CameraPanel ocr={ocr} translate={vi.fn()} />);
    const input = screen.getByLabelText('Upload image');
    // accept="image/*" would make userEvent skip it, so fire the change directly.
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not an image/i);
    expect(ocr).not.toHaveBeenCalled();
  });

  it('disables translate for empty text and clears stale results on edit', async () => {
    const user = userEvent.setup();
    render(<CameraPanel ocr={vi.fn()} translate={vi.fn().mockResolvedValue(result)} />);
    const button = screen.getByRole('button', { name: /translate to braille/i });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/check the text/i), 'abcd');
    await user.click(button);
    await screen.findByText(/Braille preview/);
    await user.type(screen.getByLabelText(/check the text/i), 'e');
    await waitFor(() => expect(screen.queryByText(/Braille preview/)).not.toBeInTheDocument());
  });

  it('explains camera permission problems', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' })) } });
    render(<CameraPanel ocr={vi.fn()} translate={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Camera access was blocked/);
  });

  it('explains missing camera support', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', {});
    render(<CameraPanel ocr={vi.fn()} translate={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not allow camera access/);
  });
});

describe('CameraPanel unreadable formats', () => {
  it('explains a file the browser cannot open instead of claiming no text was found', async () => {
    const user = userEvent.setup();
    const ocr = vi.fn();
    const prepare = vi.fn().mockRejectedValue(new Error('This looks like an iPhone HEIC photo and it could not be converted.'));
    render(<CameraPanel ocr={ocr} translate={vi.fn()} tools={{ prepare }} />);
    await user.upload(screen.getByLabelText('Upload image'), png());
    expect(await screen.findByRole('alert')).toHaveTextContent(/HEIC/);
    expect(ocr).not.toHaveBeenCalled();
    expect(screen.queryByAltText('Photo being scanned')).not.toBeInTheDocument();
  });
  it('runs OCR on the converted file', async () => {
    const user = userEvent.setup();
    const converted = new File(['y'], 'c.jpg', { type: 'image/jpeg' });
    const ocr = vi.fn().mockResolvedValue('ok');
    render(<CameraPanel ocr={ocr} translate={vi.fn()} tools={{ prepare: vi.fn().mockResolvedValue(converted) }} />);
    await user.upload(screen.getByLabelText('Upload image'), png());
    await screen.findByDisplayValue('ok');
    expect(ocr.mock.calls[0][0]).toBe(converted);
  });
});

describe('CameraPanel blind-first reporting', () => {
  it('says what is missing and asks for a retake instead of claiming success', async () => {
    const user = userEvent.setup();
    const ocr = vi.fn().mockResolvedValue({ text: 'Hello', confidence: 80, lineCount: 4, flagged: [{ word: 'pm', line: 2, confidence: 10 }],
      gaps: [{ line: 3, text: 'ope -' }, { line: 5, text: 'p Je s' }, { line: 7, text: 'x' }], corrections: [], removed: [] });
    render(<CameraPanel ocr={ocr} translate={vi.fn()} tools={{}} />);
    await user.upload(screen.getByLabelText('Upload image'), png());
    const status = await screen.findAllByRole('status');
    const text = status.map((n) => n.textContent).join(' ');
    expect(text).toMatch(/do not trust this reading/i);
    expect(text).toMatch(/could not read some text near lines 3, 5, 7/i);
    expect(text).toMatch(/take another photo/i);
    expect(text).not.toMatch(/confident in all of it/i);
  });
  it('can read the text aloud and stop', async () => {
    const user = userEvent.setup();
    const speakSpy = vi.fn(); const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak: speakSpy, cancel });
    vi.stubGlobal('SpeechSynthesisUtterance', function U(t) { this.text = t; });
    render(<CameraPanel ocr={vi.fn()} translate={vi.fn()} tools={{}} />);
    await user.type(screen.getByLabelText(/check the text/i), 'Hello there');
    await user.click(screen.getByRole('button', { name: /read the text aloud/i }));
    expect(speakSpy.mock.calls.at(-1)[0].text).toBe('Hello there');
    await user.click(screen.getByRole('button', { name: /stop reading/i }));
    expect(cancel).toHaveBeenCalled();
  });

  it('pauses, resumes, and reports read-aloud state', async () => {
    const user = userEvent.setup();
    const pause = vi.fn(); const resume = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn(), pause, resume });
    vi.stubGlobal('SpeechSynthesisUtterance', function U(t) { this.text = t; });
    render(<CameraPanel ocr={vi.fn()} translate={vi.fn()} tools={{}} />);
    await user.type(screen.getByLabelText(/check the text/i), 'Hello there');
    await user.click(screen.getByRole('button', { name: /read the text aloud/i }));
    expect(screen.getByText(/Reading status: playing/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /pause reading/i }));
    expect(pause).toHaveBeenCalled();
    expect(screen.getByText(/Reading status: paused/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /resume reading/i }));
    expect(resume).toHaveBeenCalled();
    expect(screen.getByText(/Reading status: playing/i)).toBeInTheDocument();
  });
});

describe('CameraPanel continuous book scanning', () => {
  it('saves pages independently and navigates without confusing Braille pages', async () => {
    const user = userEvent.setup();
    const ocr = vi.fn().mockResolvedValueOnce('First page text').mockResolvedValueOnce('Second page text');
    render(<CameraPanel ocr={ocr} translate={vi.fn()} tools={{}} />);
    const upload = screen.getByLabelText('Upload image');
    await user.upload(upload, png());
    expect(await screen.findByDisplayValue('First page text')).toHaveFocus();
    await user.type(screen.getByLabelText(/check the text/i), ' edited');
    await user.upload(upload, png());
    expect(await screen.findByDisplayValue('Second page text')).toBeInTheDocument();
    expect(screen.getByText('Scanned page 2 of 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /previous scanned page/i }));
    expect(screen.getByDisplayValue('First page text edited')).toBeInTheDocument();
    expect(screen.getByText('Scanned page 1 of 2')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: /next scanned page/i }));
    expect(screen.getByDisplayValue('Second page text')).toBeInTheDocument();
  });

  it('preserves each scanned page Braille translation', async () => {
    const user = userEvent.setup();
    const ocr = vi.fn().mockResolvedValueOnce('one').mockResolvedValueOnce('two');
    const translate = vi.fn().mockResolvedValue(result);
    render(<CameraPanel ocr={ocr} translate={translate} tools={{}} />);
    const upload = screen.getByLabelText('Upload image');
    await user.upload(upload, png());
    await user.click(screen.getByRole('button', { name: /translate to braille/i }));
    expect(await screen.findByLabelText(/Braille translation for scanned page 1/i)).toBeInTheDocument();
    await user.upload(upload, png());
    expect(screen.queryByLabelText(/Braille translation for scanned page 2/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /previous scanned page/i }));
    expect(screen.getByLabelText(/Braille translation for scanned page 1/i)).toBeInTheDocument();
  });
});

describe('CameraPanel corrections', () => {
  const scanned = {
    text: 'Find specific prizes', rawText: 'Find speciflc prizes', confidence: 90, attempts: 1,
    removed: [{ text: 'o', reason: 'bullet' }], flagged: [{ word: 'prizes', line: 1, confidence: 40 }],
    corrections: [{ from: 'speciflc', to: 'specific', line: 1 }], uncorrectedText: 'Find speciflc prizes',
  };
  it('lists fixes, flagged words and the original scan, and can undo the fixes', async () => {
    const user = userEvent.setup();
    render(<CameraPanel ocr={vi.fn().mockResolvedValue(scanned)} translate={vi.fn()} tools={{}} />);
    await user.upload(screen.getByLabelText('Upload image'), png());
    expect(await screen.findByDisplayValue('Find specific prizes')).toBeInTheDocument();
    expect(screen.getByText(/Fixed 1 likely misread word/)).toBeInTheDocument();
    expect(screen.getByText(/“speciflc” → “specific” on line 1/)).toBeInTheDocument();
    expect(screen.getByText(/Please check these words \(1\)/)).toBeInTheDocument();
    expect(screen.getByLabelText('Original scan text')).toHaveTextContent('Find speciflc prizes');
    await user.click(screen.getByRole('button', { name: /undo these fixes/i }));
    expect(screen.getByDisplayValue('Find speciflc prizes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /undo these fixes/i })).not.toBeInTheDocument();
  });
  it('hides the undo button once the user edits the text', async () => {
    const user = userEvent.setup();
    render(<CameraPanel ocr={vi.fn().mockResolvedValue(scanned)} translate={vi.fn()} tools={{}} />);
    await user.upload(screen.getByLabelText('Upload image'), png());
    await user.type(await screen.findByDisplayValue('Find specific prizes'), '!');
    expect(screen.queryByRole('button', { name: /undo these fixes/i })).not.toBeInTheDocument();
  });
});

describe('CameraPanel confidence feedback', () => {
  it.each([
    [90, /confident in all of it/i],
    [60, /not completely sure/i],
    [10, /do not trust this reading/i],
  ])('explains OCR confidence %i', async (confidence, re) => {
    const user = userEvent.setup();
    const ocr = vi.fn().mockResolvedValue({ text: 'abc', confidence, attempts: 1 });
    render(<CameraPanel ocr={ocr} translate={vi.fn()} tools={{ assess: vi.fn().mockResolvedValue({ ok: true }) }} />);
    await user.upload(screen.getByLabelText('Upload image'), png());
    expect(await screen.findByText(re)).toBeInTheDocument();
    expect(screen.getByDisplayValue('abc')).toBeInTheDocument();
  });

  it('adds photo advice when confidence is low and the photo looked dark', async () => {
    const user = userEvent.setup();
    const ocr = vi.fn().mockResolvedValue({ text: 'abc', confidence: 20, attempts: 4 });
    const tools = { assess: vi.fn().mockResolvedValue({ ok: false, message: 'Too dark. Turn on a light.' }) };
    render(<CameraPanel ocr={ocr} translate={vi.fn()} tools={tools} />);
    await user.upload(screen.getByLabelText('Upload image'), png());
    expect(await screen.findByText(/Too dark\. Turn on a light/)).toBeInTheDocument();
  });
});

describe('describeCameraError', () => {
  it.each([['NotFoundError', /No camera was found/], ['NotReadableError', /busy/], ['Weird', /Could not start the camera/]])(
    '%s', (name, re) => expect(describeCameraError({ name })).toMatch(re));
});
