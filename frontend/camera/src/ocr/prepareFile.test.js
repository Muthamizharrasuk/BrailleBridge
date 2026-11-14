import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('heic2any', () => ({ default: vi.fn(async () => new Blob(['jpg'], { type: 'image/jpeg' })) }));
import { prepareFile } from './imageTools.js';

afterEach(() => vi.unstubAllGlobals());

describe('prepareFile', () => {
  it('passes through files the browser can decode', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close() {} }));
    const f = new File(['x'], 'a.png', { type: 'image/png' });
    expect(await prepareFile(f)).toBe(f);
  });
  it('converts HEIC the browser cannot decode', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('nope')));
    const out = await prepareFile(new File(['x'], 'IMG_1.HEIC', { type: '' }));
    expect(out.type).toBe('image/jpeg');
  });
  it('gives a plain message for other unreadable formats', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('nope')));
    await expect(prepareFile(new File(['x'], 'a.tiff', { type: 'image/tiff' }))).rejects.toThrow(/could not be opened/);
  });
});
