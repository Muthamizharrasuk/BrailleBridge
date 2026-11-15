async function readJson(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.detail || `UNO Q translation returned HTTP ${response.status}.`
    );
  }

  return data;
}

export async function translateWithLocalAI(text, { signal } = {}) {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      target: 'en',
    }),
    signal,
  });

  const data = await readJson(response);

  if (
    typeof data.translated_text !== 'string' ||
    !data.translated_text.trim()
  ) {
    throw new Error('UNO Q returned an invalid English translation.');
  }

  return data.translated_text;
}
