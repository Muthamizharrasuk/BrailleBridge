# Optional speech compression service

This standalone service owns only upstream compression. It does not import or change the teammate's Braille engine. It uses Python's standard library, so no Python packages need installation.

From the repository root in PowerShell:

```powershell
python -m backend.speech.server
```

The service listens only on `127.0.0.1:8001`. The speech frontend proxies `/api/speech` to this service. Restart Vite after changing its configuration. The production integration teammate can mount `compress_text()` in the shared backend instead of running this development server. This local development server is not a public production deployment.

With no provider configuration, `POST /api/speech/compress` returns the original message with `status: "fallback"`. Speech recognition and verbatim Braille sending work without this server or any credentials.

For an optional OpenAI-compatible chat-completions provider, set environment variables in the terminal that runs the Python service:

```powershell
$env:LLM_BASE_URL = 'https://your-provider.example/v1'
$env:LLM_MODEL = 'your-supported-model'
$env:LLM_API_KEY = 'your-key'
python -m backend.speech.server
```

Never put these values in frontend `VITE_` variables or commit real keys. A localhost provider may omit the key; remote providers require HTTPS and a key. The adapter uses the [chat completions request format](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create). Provider/model compatibility still requires a real integration check; automated tests make no paid requests.

Input: `{ "text": "Please do not call Ana at 8:30." }`.

Output: `{ "original": "...", "text": "...", "status": "candidate" | "fallback", "reason": "..." }`.

A candidate is never automatically approved. The frontend compares original and candidate using the Braille API, then requires review and explicit approval. Numeric and selected negation/warning token checks reject some unsafe changes, but cannot establish semantic equivalence or reliably detect all name, address, condition, or warning changes. Human review is still necessary. Provider errors, missing configuration, invalid output, timeouts, and rejected candidates return the original unchanged. No provider exception bodies or keys are returned to the browser.

Run tests from the repository root:

```powershell
python -m unittest discover -s backend/speech/tests -v
```
