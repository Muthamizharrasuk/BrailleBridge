async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `UNO Q AI returned HTTP ${response.status}.`);
  return data;
}

export async function getLocalAIStatus({ signal } = {}) {
  return readJson(await fetch('/api/ai/status', { signal }));
}

export async function simplifyWithLocalAI(text, { signal } = {}) {
  const response = await fetch('/api/ai/simplify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }), signal,
  });
  const data = await readJson(response);
  if (typeof data.simplified !== 'string' || !data.simplified.trim()) throw new Error('UNO Q AI returned an invalid simplification.');
  return data.simplified;
}
