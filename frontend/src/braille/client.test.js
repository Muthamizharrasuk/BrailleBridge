import { describe, expect, it, vi } from 'vitest';
import { makeTranslationRequest, translateToBraille } from './client.js';

const result = { braille_unicode: '⠁⠃⠉⠙', cells: [1, 3, 9, 25], pages: [[1, 3, 9], [25, 0, 0]], cell_count: 4 };

describe('unified Braille client', () => {
  it('supports every implemented source and both grades', () => {
    expect(makeTranslationRequest('Hello', { source: 'text', grade: 2 })).toEqual({ source: 'text', text: 'Hello', mode: 'verbatim', grade: 2 });
    expect(makeTranslationRequest('Hello', { source: 'speech', grade: 1 }).source).toBe('speech');
    expect(makeTranslationRequest('Hello', { source: 'camera', grade: 1 }).source).toBe('camera');
  });

  it('sends the shared API contract and validates the response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
    expect(await translateToBraille('abcd', { source: 'text', grade: 2, fetchImpl })).toEqual(result);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ source: 'text', text: 'abcd', mode: 'verbatim', grade: 2 });
  });
});
