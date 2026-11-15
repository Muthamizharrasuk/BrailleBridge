import { validateTranslation } from '../../speech/src/braille/client.js';

export function makeTranslationRequest(text, { source = 'text', grade = 1, mode = 'verbatim' } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Enter or capture some text first.');
  if (!['text', 'speech', 'camera', 'website'].includes(source)) throw new Error('Unsupported input source.');
  if (![1, 2].includes(grade)) throw new Error('Unsupported Braille grade.');
  return { source, text, mode, grade };
}

export async function translateToBraille(text, {
  source = 'text', grade = 1, mode = 'verbatim', endpoint = '/api/braille/translate',
  fetchImpl = globalThis.fetch, signal,
} = {}) {
  const request = makeTranslationRequest(text, { source, grade, mode });
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request), signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Cannot reach the Braille service. Check that the backend is running.');
  }
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json())?.detail || ''; } catch { /* non-JSON response */ }
    throw new Error(detail || `Braille service returned HTTP ${response.status}.`);
  }
  try { return validateTranslation(await response.json()); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('The Braille service returned invalid JSON.');
    throw error;
  }
}
