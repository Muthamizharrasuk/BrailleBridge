# Real speech-to-Braille demo on Windows + Ubuntu WSL

The frontend runs on Windows at `http://127.0.0.1:5173`. The unchanged FastAPI/Liblouis backend runs in Ubuntu WSL at port 8000. Real API mode is now the default. Vite proxies `/api/braille` and `/api/health` to port 8000, avoiding cross-origin browser requests. This setup requires real Liblouis; health alone does not confirm the translator is installed.

## Verification status on this machine (November 14, 2026)

Ubuntu WSL is installed. `/usr/bin/python3` imports Liblouis 3.36.0. An isolated environment at `/home/mahika/.venvs/braillebridge` was created with `--system-site-packages`, and the existing backend requirements were installed there. System Python was not modified. Both English translation tables load successfully. In this Liblouis binding, `checkTable()` returns `None` on success and raises on failure; it does not return a boolean.

The actual FastAPI backend and Windows Vite frontend are running on ports 8000 and 5173. Both direct API and Vite proxy requests for `Hello` returned HTTP 200 with cells `[32,19,17,7,7,21]`, pages `[[32,19,17],[7,7,21]]`, and `cell_count: 6`.

Checks: 38 Python tests passed (plus two subtests); 59 frontend tests passed; production build passed; all seven live HTTP integration tests passed. These checks verified indicators, punctuation, longer sentences, both grades/modes, CORS, and proxy connectivity. One real API comparison measured 67 original cells versus 31 concise cells (53.7% reduction) for the test's fixed original/concise texts; that test does not call an LLM. The Python suite emitted one non-blocking FastAPI/Starlette `httpx` deprecation warning. All seven Chrome browser tests also passed, including the opt-in live speech-adapter to actual API to preview test (no translation interception). The physical microphone test still requires user confirmation; automated browser checks simulate only speech recognition events.

## One-time Linux setup

If WSL is absent, open **PowerShell as Administrator**:

```powershell
winget install --id Microsoft.WSL --exact --source winget
wsl --install -d Ubuntu
```

Restart Windows if requested, then open Ubuntu and finish its first-time user setup. See [Microsoft's WSL installation instructions](https://learn.microsoft.com/en-us/windows/wsl/install). In Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y python3-louis liblouis-data liblouis-bin python3-venv
cd /mnt/c/Users/Mahik/Desktop/BrailleBridge
/usr/bin/python3 -m venv --system-site-packages ~/.venvs/braillebridge
~/.venvs/braillebridge/bin/python -m pip install -r backend/requirements.txt
~/.venvs/braillebridge/bin/python -c 'import louis; print(louis.version()); print(louis.checkTable(["unicode-braille.utb", "en-us-g1.ctb"])); print(louis.checkTable(["unicode-braille.utb", "en-us-g2.ctb"]))'
~/.venvs/braillebridge/bin/python -m pytest backend/braille/tests backend/speech/tests -q
```

Use a separate Linux virtual environment; Windows `.venv/Scripts/python.exe` cannot load Ubuntu packages. `--system-site-packages` exposes Ubuntu's `python3-louis` binding to the Linux environment. The table checks must finish without an exception (`None` is the successful return value in the installed binding). Do not install the unrelated PyPI package named `louis` as a substitute. The translator's `brew install liblouis` error describes the teammate's macOS setup, not the Windows/Ubuntu commands.

## Start the demo

Terminal 1, **Ubuntu WSL**, from the repository:

```bash
cd /mnt/c/Users/Mahik/Desktop/BrailleBridge
~/.venvs/braillebridge/bin/python -m uvicorn backend.api.server:app --host 0.0.0.0 --port 8000
```

Terminal 2, **Windows PowerShell**:

```powershell
cd C:\Users\Mahik\Desktop\BrailleBridge\frontend\speech
npm ci
npm run dev -- --port 5173 --strictPort
```

Optional terminal 3, **Windows PowerShell**, only for concise suggestions (no provider is needed for verbatim):

```powershell
cd C:\Users\Mahik\Desktop\BrailleBridge
python -m backend.speech.server
```

LLM configuration is described in `backend/speech/README.md`. With no provider, concise mode keeps the original text and sends `mode: "verbatim"`. Testing a real LLM suggestion requires a configured provider; no paid calls are made by automated checks.

## Verify the actual connection

In another **Windows PowerShell** terminal:

```powershell
cd C:\Users\Mahik\Desktop\BrailleBridge\frontend\speech
npm test
npm run build
npm run test:integration
$env:RUN_LIVE_BRAILLE = '1'
npm run test:browser
Remove-Item Env:RUN_LIVE_BRAILLE
```

`test:integration` requires both running servers and never substitutes mock responses. It checks the exact Hello output, indicators, longer sentences, punctuation, numbers, both grades/modes, actual cell savings, direct backend CORS, and the frontend proxy. The browser suite's live case simulates only the microphone result and calls the actual translation API. Other browser cases explicitly use mock responses for failure/approval tests; those are not proof of live translation. A physical microphone check still requires a person.

Open `http://127.0.0.1:5173` in Chrome. Keep **Real Braille API** selected. Select **Start Listening**, allow your microphone, say “Hello”, then **Stop Listening**. Review/edit to exactly `Hello` if recognition inserted punctuation. Select **Send to Braille**. Expect **API response**, six cells, pages `[[32,19,17],[7,7,21]]`. The first mask 32 is the capitalization indicator.

Repeat with `Do NOT call Ana until 8:30. Meet at 42 Main St.!`, and navigate all pages. Switch **Message mode** between verbatim and concise; never approve a suggestion without reviewing its meaning. Mock mode remains available explicitly via **Translation source**, or set `VITE_BRAILLE_MODE=mock` in `.env.local` for independent work.

## Port and environment troubleshooting

- The defaults need no `.env.local`. If one already exists, remove stale `VITE_BRAILLE_API_URL` or `VITE_BRAILLE_MODE=mock` settings. Restart Vite after changing environment files.
- If Windows cannot reach WSL via localhost, get Ubuntu's address with `wsl -d Ubuntu hostname -I`. Set `BRAILLE_BACKEND_URL=http://<Ubuntu-IP>:8000` in `frontend/speech/.env.local`, then restart Vite. The backend command must bind `0.0.0.0` for this path.
- A teammate's reachable server can be used instead by setting `BRAILLE_BACKEND_URL=http://<teammate-IP>:8000`. The same live tests can target it with `$env:BRAILLE_TEST_URL='http://<teammate-IP>:8000'`.
- A direct `VITE_BRAILLE_API_URL` bypasses the proxy and needs backend CORS. The merged FastAPI server already allows origins/methods/headers; the live suite verifies the browser preflight.
- Port 5173 is strict so the frontend does not silently move to a different URL. Stop the old server in its terminal before starting another instance.
- HTTP 500 with “Liblouis Python bindings not found” means the API runs but translation cannot. Finish Ubuntu package/table setup; do not interpret this as a working demo.

No core translator, contract, or hardware changes are required by this setup.
