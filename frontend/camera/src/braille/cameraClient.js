import { validateTranslation } from '../../../speech/src/braille/client.js';

// Contract: source "camera", mode "verbatim", grade 1. Text is sent exactly as reviewed.
export function makeCameraRequest(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('There is no text to translate. Scan a page or type some text first.');
  return { source: 'camera', text, mode: 'verbatim', grade: 1 };
}

export async function translateCamera(text, {
  endpoint = '/api/braille/translate', fetchImpl = globalThis.fetch, signal, timeoutMs = 15000,
} = {}) {
  const request = makeCameraRequest(text);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request), signal: controller.signal,
    });
    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        if (typeof body.detail === 'string') detail = ` ${body.detail.slice(0, 300)}`;
      } catch { /* non-JSON error body */ }
      throw new Error(`Braille API request failed (HTTP ${response.status}).${detail || ' Check that the translation service is running on port 8000.'}`);
    }
    let data;
    try { data = await response.json(); } catch { throw new Error('The Braille API did not return valid JSON.'); }
    return validateTranslation(data);
  } catch (error) {
    if (timedOut) throw new Error('The Braille API took too long to respond. Please try again.');
    if (signal?.aborted) throw error;
    if (error instanceof TypeError) throw new Error('Cannot reach the Braille API. Is the backend running on port 8000?');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
