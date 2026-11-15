async function jsonOrError(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Hardware request failed (${response.status}).`);
  return data;
}

export async function getHardwareStatus() {
  return jsonOrError(await fetch('/api/hardware/status'));
}

export async function sendHardwarePage(cells) {
  return jsonOrError(await fetch('/api/hardware/page', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cells }),
  }));
}
