# BrailleBridge speech module - steps 1 and 2

For real Windows/WSL integration and exact startup commands, see [DEMO.md](DEMO.md). The frontend now defaults to the real API through the Vite proxy; mock mode remains an explicit option.

Standalone React development app owned by the speech branch. No changes to the shared app layout, Braille engine, contracts, or hardware are needed.

## Run on Windows / PowerShell

```powershell
cd C:\Users\Mahik\Desktop\BrailleBridge\frontend\speech
npm install
npm run dev
```

Open the localhost URL printed by Vite, ideally in Chrome or Edge. Allow microphone access when you select **Start Listening**. Browser API presence does not guarantee the browser speech service is enabled or reachable. No API key is needed. Recognition may require an internet connection and may send audio to the browser vendor's service. This is not an offline audio recorder; the app does not store audio.

1. Select **Start Listening** and say: "Do not call Ana until 8:30."
2. Check the listening indicator and live preview.
3. Select **Stop Listening** and wait for the final transcript.
4. Correct the transcript in the text box. Start again to append more speech.
5. Deny microphone access once to check the recovery message; typing still works.
6. In an unsupported browser, check that typing works and the microphone button is disabled.

The transcript is kept only in memory and is cleared on refresh. Interim words are shown separately and only final results enter the editable transcript. Editing is enabled after the recognition session ends, so incoming results cannot overwrite corrections. No automatic restart or background listening occurs.

## Verify

```powershell
npm test
npm run build
npm run test:browser
```

Tests use a fake browser speech API: no physical microphone, audio upload, paid API, or credentials are required.

## Integration boundary

- `src/components/SpeechPanel.jsx`: independent React component; import `src/speech.css` for its current styling.
- `src/speech/useSpeechRecognition.js`: React lifecycle and cleanup.
- `src/speech/browserRecognition.js`: testable browser adapter, support detection, start/stop, and errors.
- The adapter exposes `start()`, `stop()`, `setTranscript(text)`, `getSnapshot()`, and `dispose()`.
- `onChange(snapshot)` publishes `{ supported, message, status, transcript, interim, error }`.
- The browser module and its optional app entry point are isolated under `frontend/speech` to avoid shared-file conflicts.

## Try the Braille preview without a backend

1. Keep **Translation source** set to **Demo fixtures (no API needed)**.
2. Select **Use sample: Hello**. This replaces your transcript with the exact fixture text.
3. Select **Send to Braille**. Expect 6 cells and 2 pages, including the capital indicator mask 32.
4. Select **Next page**. Expect masks 7, 7, and 21.
5. Try **Use sample: Hi**, then send again. Expect 3 cells and 1 page, including mask 32.
6. Enter another message and send. Expect a clear fixture-only error, never invented Braille.

Demo mode supports only these two exact static fixtures, with no production translation logic. Both fixtures include a capital indicator. Preview pages are visual only; no Arduino communication occurs. Editing the transcript, beginning a new microphone session, or switching sources clears any old preview and cancels in-flight requests. Returned capital, number, and letter indicators are never filtered or removed.

## Connect the teammate's real API

The reusable `translateSpeech(text, options)` function in `src/braille/client.js` sends `POST /api/braille/translate` with `{ source: "speech", text, mode: "verbatim", grade: 1 }`. The reviewed text is preserved exactly. It validates masks, counts, three-cell pages, and final padding in the response. HTTP errors, invalid responses, connection failures, and a 15-second timeout are reported without falling back to demo data.

For a backend on another port, copy `.env.example` to `.env.local`, set `VITE_BRAILLE_API_URL` to its full translation endpoint, and restart Vite. The backend must allow the frontend origin (normally `http://127.0.0.1:5173`) via CORS. This variable is public configuration, so never put secrets in it. Without configuration, Vite proxies the same-origin `/api/braille/translate` to `http://127.0.0.1:8000`. Set `BRAILLE_BACKEND_URL` to change that target, or explicitly select demo mode for independent work.

Choose **Real Braille API**, review the transcript, then select **Send to Braille**. A successful response is labeled **API response**. Without the teammate's backend, an error is expected. Network tests intercept/mock responses and do not prove the teammate's running service works.

## Optional concise mode

Verbatim is the default and preserves the reviewed transcript unchanged. In **Concise**, select **Suggest concise version** to request a suggestion from the separate speech service (see `backend/speech/README.md`). This sends the message to the configured LLM provider if available. The transcript is never replaced.

Both versions are translated through the currently selected Braille adapter when possible, using `verbatim` for original and `compressed` for candidate. The comparison uses returned `cell_count` values, including indicators, and reports `(original - compressed) / original * 100`. Unknown counts remain unavailable, never estimates based on English character counts. Failed compression keeps the original text selected and sends it with `mode: "verbatim"`. The demo fixtures do not support arbitrary compression comparisons.

Read both messages and choose **Approve concise text** before sending a candidate. Approval is disabled when measured cell count does not decrease. When counts are unavailable, an explicit approval remains possible, with a warning about unknown savings. Changes to the transcript, source, listening state, or mode invalidate approval and any previous preview. **Use original text** restores verbatim sending. Even after approval, inspect meaning carefully: no LLM or numeric/keyword heuristic guarantees semantic equivalence.

The current UI uses Grade 1; the reusable client also accepts Grade 2. Conversation history, spoken replies, and a Whisper transcription fallback remain separate future steps. The merged FastAPI/Liblouis engine is now in this checkout. It requires a working Liblouis runtime; follow DEMO.md and run `npm run test:integration` to verify a real server.

Browser tests use installed Google Chrome (Playwright channel `chrome`). If you use Edge instead, change the channel to `msedge` in `playwright.config.js`. Browser tests check native API availability, desktop/mobile rendering, and simulated recognition; they do not verify real microphone audio or the vendor speech service.
