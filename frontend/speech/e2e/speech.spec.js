import { test, expect } from '@playwright/test';

// Native capability check only: never opens a real microphone in automation.
test('detects speech support in installed Chrome and renders a responsive panel', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const capability = await page.evaluate(() => ({
    secureContext: window.isSecureContext,
    speechRecognition: typeof (window.SpeechRecognition || window.webkitSpeechRecognition),
    userAgent: navigator.userAgent,
  }));
  console.log('Native browser capability:', JSON.stringify(capability));
  expect(capability.secureContext).toBe(true);
  expect(capability.speechRecognition).toBe('function');
  await expect(page.getByRole('button', { name: 'Start Listening' })).toBeEnabled();
  await page.getByRole('textbox').fill('Do not call Ana until 8:30.');
  await expect(page.getByRole('textbox')).toHaveValue('Do not call Ana until 8:30.');
  await page.screenshot({ path: '.playwright/speech-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Start Listening' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.playwright/speech-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('handles listening, final transcript, editing, and permission denial in the browser', async ({ page }) => {
  await page.addInitScript(() => {
    window.SpeechRecognition = class {
      constructor() { window.testRecognition = this; }
      start() { this.onstart?.(); }
      stop() {
        this.onresult?.({ results: [Object.assign([{ transcript: 'Do not call Ana until 8:30.' }], { isFinal: true })] });
        this.onend?.();
      }
      abort() {}
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Listening' }).click();
  await expect(page.getByRole('status')).toHaveText('Listening...');
  await expect(page.getByRole('textbox')).toHaveAttribute('readonly');
  await page.evaluate(() => window.testRecognition.onresult({ results: [Object.assign([{ transcript: 'Do not call' }], { isFinal: false })] }));
  await expect(page.getByText('Do not call', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop Listening' }).click();
  await expect(page.getByRole('textbox')).toHaveValue('Do not call Ana until 8:30.');
  await page.getByRole('textbox').fill('Do not call Ana until 9:30.');
  await page.getByRole('button', { name: 'Start Listening' }).click();
  await page.evaluate(() => window.testRecognition.onerror({ error: 'not-allowed' }));
  await expect(page.getByRole('alert')).toContainText('denied');
  await expect(page.getByRole('textbox')).toHaveValue('Do not call Ana until 9:30.');
  await expect(page.getByRole('textbox')).not.toHaveAttribute('readonly');
  await page.getByRole('button', { name: 'Clear transcript' }).click();
  await expect(page.getByRole('textbox')).toHaveValue('');
});

test('supports typing when browser recognition is missing', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start Listening' })).toBeDisabled();
  await expect(page.getByText(/Speech recognition is unavailable/)).toBeVisible();
  await page.getByRole('textbox').fill('Typed fallback');
  await expect(page.getByRole('textbox')).toHaveValue('Typed fallback');
});

test('sends a labeled fixture and navigates its three-cell pages', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Use sample: Hello' }).click();
  await expect(page.getByRole('textbox')).toHaveValue('Hello');
  await page.getByRole('button', { name: 'Send to Braille' }).click();
  await expect(page.getByRole('heading', { name: 'Braille preview' })).toBeVisible();
  await expect(page.getByText('6 Braille cells · 2 three-cell pages · Grade 1')).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByRole('img', { name: 'Padding cell' })).toHaveCount(0);
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.playwright/braille-preview-mobile.png', fullPage: true });
  await page.getByRole('textbox').fill('Another message');
  await expect(page.getByRole('heading', { name: 'Braille preview' })).toHaveCount(0);
});

test('uses the real API contract with an intercepted network response', async ({ page }) => {
  let submitted;
  await page.route('**/api/braille/translate', async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { braille_unicode: '\u2813\u280a', cells: [19, 10], pages: [[19, 10, 0]], cell_count: 2 } });
  });
  await page.goto('/');
  await page.getByRole('textbox').fill('Hi');
  await page.getByRole('combobox', { name: 'Translation source' }).selectOption('real');
  await page.getByRole('button', { name: 'Send to Braille' }).click();
  await expect(page.getByRole('heading', { name: 'Braille preview' })).toBeVisible();
  await expect(page.getByText('API response', { exact: true })).toBeVisible();
  expect(submitted).toEqual({ source: 'speech', text: 'Hi', mode: 'verbatim', grade: 1 });
});

test('preserves the transcript and requires approval before sending concise text', async ({ page }) => {
  const original = 'Please do not call Ana at 8:30.';
  const candidate = 'Do not call Ana at 8:30.';
  const calls = [];
  await page.route('**/api/speech/compress', (route) => route.fulfill({ json: { status: 'candidate', original, text: candidate } }));
  await page.route('**/api/braille/translate', (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    // Synthetic API fixture counts, not a second translation implementation.
    const cells = body.text === original ? [32, 1, 60, 1, 48, 3] : [32, 1, 60];
    const pages = body.text === original ? [[32, 1, 60], [1, 48, 3]] : [[32, 1, 60]];
    return route.fulfill({ json: { cells, pages, cell_count: cells.length, braille_unicode: '' } });
  });
  await page.goto('/');
  await page.getByRole('textbox').fill(original);
  await page.getByRole('combobox', { name: 'Translation source' }).selectOption('real');
  await page.getByRole('combobox', { name: 'Message mode' }).selectOption('compressed');
  await page.getByRole('button', { name: 'Suggest concise version' }).click();
  await expect(page.getByText('Braille cell reduction: 50.0%.')).toBeVisible();
  await expect(page.getByText(/Will send: original transcript unchanged/)).toBeVisible();
  await page.getByRole('button', { name: 'Approve concise text' }).click();
  await page.getByRole('button', { name: 'Send to Braille' }).click();
  await expect(page.getByText('Sent mode: compressed')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue(original);
  expect(calls.at(-1)).toEqual({ source: 'speech', text: candidate, mode: 'compressed', grade: 1 });
  await page.getByRole('textbox').fill('Do not call Ana until 9:30.');
  await expect(page.getByText(/Will send: original transcript unchanged/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Braille preview' })).toHaveCount(0);
});
