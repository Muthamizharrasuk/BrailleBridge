export async function requestCompression(text, { signal, fetchImpl = globalThis.fetch } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 25000);
  try {
    const response = await fetchImpl('/api/speech/compress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }), signal: controller.signal,
    });
    if (!response.ok) throw new Error('Compression service unavailable');
    const data = await response.json();
    if (data.original !== text || !['candidate', 'fallback'].includes(data.status)
      || typeof data.text !== 'string' || !data.text.trim()) throw new Error('Invalid compression response');
    return data.status === 'fallback' ? { ...data, text } : data;
  } catch (error) {
    if (signal?.aborted) throw error;
    return { original: text, text, status: 'fallback', reason: 'Compression is unavailable. Your original message will be used unchanged.' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function evaluateCompression(original, candidate, translate, { signal } = {}) {
  const results = await Promise.allSettled([
    translate(original, { mode: 'verbatim', signal }),
    translate(candidate, { mode: 'compressed', signal }),
  ]);
  const originalCount = results[0].status === 'fulfilled' ? results[0].value.cell_count : null;
  const compressedCount = results[1].status === 'fulfilled' ? results[1].value.cell_count : null;
  return {
    originalCount, compressedCount,
    reduction: originalCount > 0 && compressedCount !== null
      ? (originalCount - compressedCount) / originalCount * 100 : null,
  };
}
