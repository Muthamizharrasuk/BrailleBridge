export async function recognizeOnBoard(file, { onStatus } = {}) {
  onStatus?.('Sending image to Arduino UNO Q...');

  const form = new FormData();
  form.append('file', file, file.name || 'webcam.jpg');

  const response = await fetch('/api/ocr/recognize', {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    throw new Error(
      `UNO Q image recognition failed (HTTP ${response.status}).`
    );
  }

  const result = await response.json();
  const text = result.text?.trim();

  if (!text) {
    throw new Error(
      'IndraOCR could not recognize any text. Try a clearer photo.'
    );
  }

  return text;
}
