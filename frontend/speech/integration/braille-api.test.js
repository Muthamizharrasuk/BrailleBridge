// Opt-in LIVE tests. No fake translation responses and no paid LLM calls.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { translateSpeech } from '../src/braille/client.js';

const base = (process.env.BRAILLE_TEST_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const frontend = (process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const translate = (text, options = {}) => translateSpeech(text, { endpoint: `${base}/api/braille/translate`, ...options });

before(async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200, 'Start the real FastAPI server before running live tests.');
});

test('Hello Grade 1 includes the capital sign and exactly six cells', async () => {
  assert.deepEqual(await translate('Hello'), {
    braille_unicode: '\u2820\u2813\u2811\u2807\u2807\u2815',
    cells: [32, 19, 17, 7, 7, 21], pages: [[32, 19, 17], [7, 7, 21]], cell_count: 6,
  });
});

test('number, capital-word, letter, and punctuation indicators come from Liblouis', async () => {
  assert.deepEqual((await translate('123')).cells, [60, 1, 3, 9]);
  assert.deepEqual((await translate('ABC')).cells, [32, 32, 1, 3, 9]);
  assert.deepEqual((await translate('a')).cells, [48, 1]);
  assert.equal((await translate('hi, ok.')).braille_unicode, '\u2813\u280a\u2802\u2800\u2815\u2805\u2832');
});

for (const grade of [1, 2]) {
  test(`long speech text, whitespace, and mode switching (Grade ${grade})`, async () => {
    const text = 'Do NOT call Ana until 8:30. Meet at 42 Main St.!\nKeep  two spaces.';
    const original = await translate(text, { grade });
    assert.deepEqual(await translate(text, { grade, mode: 'compressed' }), original);
    assert.equal(original.pages.length, Math.ceil(original.cell_count / 3));
    assert.ok(original.cell_count > 6);
    assert.ok(original.cells.includes(32));
    assert.ok(original.cells.includes(60));
    assert.deepEqual((await translate('ab  cd', { grade: 1 })).cells, [1, 3, 0, 0, 9, 25]);
  });
}

test('compares original and upstream concise text using real API counts', async () => {
  const original = await translate('Excuse me, could you please tell me where the nearest bus stop is?');
  const candidate = await translate('Where is the nearest bus stop?', { mode: 'compressed' });
  assert.ok(candidate.cell_count < original.cell_count);
  console.log('Actual cell savings:', JSON.stringify({ original: original.cell_count, concise: candidate.cell_count,
    reduction: (original.cell_count - candidate.cell_count) / original.cell_count * 100 }));
});

test('browser CORS preflight permits the speech frontend origin', async () => {
  const response = await fetch(`${base}/api/braille/translate`, {
    method: 'OPTIONS', headers: { Origin: frontend, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  assert.equal(response.status, 200);
  assert.ok(['*', frontend].includes(response.headers.get('access-control-allow-origin')));
});

test('Vite proxy reaches the same actual backend and preserves all returned masks', async () => {
  assert.equal((await fetch(`${frontend}/api/health`)).status, 200);
  assert.deepEqual(await translateSpeech('Hello', { endpoint: `${frontend}/api/braille/translate` }), await translate('Hello'));
});
