import { describe, expect, it, vi } from 'vitest';
import { recognizeText, validateImageFile } from './ocr.js';

describe('OCR', () => {
  it('returns recognized text and reports progress', async () => {
    const onProgress = vi.fn();
    const recognizeImpl = vi.fn(async (_i, _l, { logger }) => {
      logger({ status: 'recognizing text', progress: 0.5 });
      return { data: { text: 'Hello world\n\n' } };
    });
    await expect(recognizeText({}, { recognizeImpl, onProgress })).resolves.toBe('Hello world');
    expect(recognizeImpl.mock.calls[0][1]).toBe('eng');
    expect(onProgress).toHaveBeenCalledWith(0.5);
  });
  it('errors helpfully when no text is found', async () => {
    const recognizeImpl = async () => ({ data: { text: '  \n' } });
    await expect(recognizeText({}, { recognizeImpl })).rejects.toThrow(/No text was found/);
  });
  it('wraps engine failures', async () => {
    const recognizeImpl = async () => { throw new Error('worker died'); };
    await expect(recognizeText({}, { recognizeImpl })).rejects.toThrow(/Text recognition failed: worker died/);
  });
  it('validates image files', () => {
    expect(() => validateImageFile(new File(['x'], 'a.txt', { type: 'text/plain' }))).toThrow(/not an image/);
    expect(() => validateImageFile({ type: 'image/png', size: 20 * 1024 * 1024 })).toThrow(/15 MB/);
    expect(() => validateImageFile(new File(['x'], 'a.png', { type: 'image/png' }))).not.toThrow();
  });
});
