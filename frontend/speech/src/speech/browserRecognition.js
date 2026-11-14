// Browser-only recognition adapter. No microphone or paid service is needed in tests.
const messages = {
  'not-allowed': 'Microphone access was denied. Allow microphone access in your browser settings, then try again. You can also type below.',
  'service-not-allowed': 'Your browser blocked speech recognition. Check its speech and microphone settings, or type below.',
  'audio-capture': 'No working microphone was found. Connect a microphone and check your system input settings.',
  'no-speech': 'No speech was detected. Try again, speak closer to the microphone, or type below.',
  network: 'The speech service could not connect. Check your connection and try again, or type below.',
  'language-not-supported': 'English (US) speech recognition is unavailable in this browser. You can type below.',
};

export function getSpeechSupport(environment = globalThis) {
  if (environment.isSecureContext === false) {
    return { supported: false, message: 'Microphone recognition needs HTTPS or localhost. You can still type below.' };
  }
  const supported = Boolean(environment.SpeechRecognition || environment.webkitSpeechRecognition);
  return {
    supported,
    message: supported
      ? 'Browser speech recognition is available. Microphone access is requested when you start.'
      : 'Speech recognition is unavailable in this browser. Try Chrome or Edge, or type below.',
  };
}

function appendText(base, addition) {
  if (!addition) return base;
  if (!base) return addition;
  return base + (/\s$/.test(base) || /^\s/.test(addition) ? '' : ' ') + addition;
}

export function createBrowserRecognition({ environment = globalThis, onChange = () => {}, language = 'en-US' } = {}) {
  const support = getSpeechSupport(environment);
  let state = { ...support, status: 'idle', transcript: '', interim: '', error: '' };
  let current = null;
  let disposed = false;
  const publish = (patch) => {
    if (disposed) return;
    state = { ...state, ...patch };
    onChange(state);
  };
  const detach = (recognition) => {
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
  };
  const finish = (recognition, patch = {}) => {
    if (current !== recognition || disposed) return;
    detach(recognition);
    current = null;
    publish({ status: 'idle', interim: '', ...patch });
  };

  return {
    getSnapshot: () => state,
    setTranscript(text) {
      if (state.status === 'idle') publish({ transcript: text, error: '' });
    },
    start() {
      if (disposed || !support.supported || current) return;
      const Recognition = environment.SpeechRecognition || environment.webkitSpeechRecognition;
      let recognition;
      const base = state.transcript;
      let receivedFinal = false;
      try {
        recognition = new Recognition();
        current = recognition;
        recognition.lang = language;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.onstart = () => {
          if (current === recognition) publish({ status: 'listening' });
        };
        recognition.onresult = (event) => {
          if (current !== recognition || disposed) return;
          let final = '';
          let interim = '';
          // Rebuild the session from the full result list: interim results are replaced,
          // and previously finalized phrases are never appended twice.
          for (let index = 0; index < event.results.length; index += 1) {
            const result = event.results[index];
            const text = result[0]?.transcript || '';
            if (result.isFinal) final += text;
            else interim += text;
          }
          receivedFinal = Boolean(final.trim());
          publish({ transcript: appendText(base, final), interim });
        };
        recognition.onerror = (event) => {
          if (current !== recognition || disposed) return;
          finish(recognition, {
            error: messages[event.error] || 'Speech recognition stopped unexpectedly. Try again or type below.',
          });
          try { recognition.abort(); } catch { /* The service may already have ended. */ }
        };
        recognition.onend = () => finish(recognition, {
          error: receivedFinal ? '' : messages['no-speech'],
        });
        publish({ status: 'requesting', error: '', interim: '' });
        recognition.start();
      } catch (error) {
        if (recognition) {
          finish(recognition, { error: error.name === 'NotAllowedError' ? messages['not-allowed'] : 'Could not start speech recognition. Try again or type below.' });
          try { recognition.abort(); } catch { /* No active session. */ }
        } else {
          publish({ status: 'idle', error: 'Could not initialize speech recognition. You can type below.' });
        }
      }
    },
    stop() {
      if (!current || disposed || state.status === 'stopping') return;
      const recognition = current;
      if (state.status === 'requesting') {
        finish(recognition);
        try { recognition.abort(); } catch { /* No active session. */ }
        return;
      }
      publish({ status: 'stopping' });
      try {
        // stop(), unlike abort(), allows a final recognition result to arrive.
        recognition.stop();
      } catch {
        finish(recognition, { error: 'The microphone session ended. Your finalized transcript is saved below.' });
        try { recognition.abort(); } catch { /* No active session. */ }
      }
    },
    dispose() {
      disposed = true;
      if (current) {
        detach(current);
        try { current.abort(); } catch { /* No active session. */ }
        current = null;
      }
    },
  };
}
