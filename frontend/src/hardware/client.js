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

// Shared pagination controlled by the Arduino UNO Q.
export async function getDisplayStatus() {
  return jsonOrError(await fetch('/api/display/status'));
}

export async function loadDisplay(cells) {
  return jsonOrError(await fetch('/api/display/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cells }),
  }));
}

export async function nextDisplayPage() {
  return jsonOrError(await fetch('/api/display/next', {
    method: 'POST',
  }));
}

export async function previousDisplayPage() {
  return jsonOrError(await fetch('/api/display/previous', {
    method: 'POST',
  }));
}

export async function restartDisplay() {
  return jsonOrError(await fetch('/api/display/restart', {
    method: 'POST',
  }));
}
