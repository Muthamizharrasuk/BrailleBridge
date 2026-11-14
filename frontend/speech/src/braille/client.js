export function validateTranslation(data) {
  const mask = (value) => Number.isInteger(value) && value >= 0 && value <= 63;
  if (!data || typeof data.braille_unicode !== 'string' || !Array.isArray(data.cells)
    || !data.cells.every(mask) || data.cell_count !== data.cells.length
    || !Array.isArray(data.pages) || data.pages.length !== Math.ceil(data.cells.length / 3)
    || !data.pages.every((page) => Array.isArray(page) && page.length === 3 && page.every(mask))) {
    throw new Error('The Braille API returned an invalid response. Check the shared API contract.');
  }
  const flat = data.pages.flat();
  if (!flat.every((value, index) => value === (data.cells[index] ?? 0))) {
    throw new Error('The Braille API returned pages that do not match its cells.');
  }
  return data;
}

export function makeSpeechRequest(text, mode = 'verbatim', grade = 1) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Enter or record a message first.');
  if (!['verbatim', 'compressed'].includes(mode)) throw new Error('Unsupported Braille mode.');
  if (![1, 2].includes(grade)) throw new Error('Unsupported Braille grade.');
  // Use trim only for validation. Preserve the reviewed transcript in the payload.
  return { source: 'speech', text, mode, grade };
}

export async function translateSpeech(text, {
  mode = 'verbatim', grade = 1,
  endpoint = '/api/braille/translate', fetchImpl = globalThis.fetch,
  signal, timeoutMs = 15000,
} = {}) {
  const request = makeSpeechRequest(text, mode, grade);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request), signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Braille API request failed (HTTP ${response.status}). Check that the translation service is running.`);
    let data;
    try { data = await response.json(); }
    catch { throw new Error('The Braille API did not return valid JSON. Check the API URL and service.'); }
    return validateTranslation(data);
  } catch (error) {
    if (timedOut) throw new Error('The Braille API took too long to respond. Please try again.');
    if (signal?.aborted) throw error;
    if (error instanceof TypeError) throw new Error('Cannot reach the Braille API. Check the service URL, connection, and CORS settings.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
