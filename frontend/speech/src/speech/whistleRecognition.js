export function getSpeechSupport(environment = globalThis) {
  const supported = Boolean(
    environment.navigator?.mediaDevices?.getUserMedia &&
    environment.AudioContext &&
    environment.isSecureContext !== false
  );

  return {
    supported,
    message: supported
      ? 'Microphone audio is processed locally by Cactus Whistle on the UNO Q.'
      : 'Microphone access requires Chrome on localhost or HTTPS. You can still type below.',
  };
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function string(offset, value) {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  }

  string(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  string(8, 'WAVE');
  string(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  string(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  samples.forEach((sample, i) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, clamped < 0
      ? clamped * 32768
      : clamped * 32767, true);
  });

  return new Blob([buffer], { type: 'audio/wav' });
}

export function createWhistleRecognition({
  environment = globalThis,
  onChange = () => {},
} = {}) {
  const support = getSpeechSupport(environment);
  let state = {
    ...support,
    status: 'idle',
    transcript: '',
    interim: '',
    error: '',
  };

  let stream = null;
  let context = null;
  let source = null;
  let processor = null;
  let chunks = [];
  let disposed = false;
  let controller = null;

  const publish = (patch) => {
    if (disposed) return;
    state = { ...state, ...patch };
    onChange(state);
  };

  const cleanup = async () => {
    processor?.disconnect();
    source?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    processor = null;
    source = null;
    stream = null;

    if (context) {
      await context.close().catch(() => {});
      context = null;
    }
  };

  return {
    getSnapshot: () => state,

    setTranscript(text) {
      if (state.status === 'idle') {
        publish({ transcript: text, error: '' });
      }
    },

    async start() {
      if (disposed || !support.supported || state.status !== 'idle') return;

      publish({ status: 'requesting', error: '', interim: '' });

      try {
        stream = await environment.navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        if (disposed) {
          await cleanup();
          return;
        }

        context = new environment.AudioContext({ sampleRate: 16000 });
        source = context.createMediaStreamSource(stream);
        processor = context.createScriptProcessor(4096, 1, 1);
        chunks = [];

        processor.onaudioprocess = (event) => {
          if (state.status === 'listening') {
            chunks.push(new Float32Array(
              event.inputBuffer.getChannelData(0)
            ));
          }
        };

        source.connect(processor);
        processor.connect(context.destination);

        publish({ status: 'listening' });
      } catch (error) {
        await cleanup();
        publish({
          status: 'idle',
          error: error.name === 'NotAllowedError'
            ? 'Microphone permission denied. Allow access in Chrome.'
            : `Could not start recording: ${error.message}`,
        });
      }
    },

    async stop() {
      if (disposed || state.status !== 'listening') return;

      publish({ status: 'stopping' });

      const sampleRate = context.sampleRate;
      await cleanup();

      const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
      const samples = new Float32Array(length);

      let offset = 0;
      for (const chunk of chunks) {
        samples.set(chunk, offset);
        offset += chunk.length;
      }

      chunks = [];

      if (!length) {
        publish({ status: 'idle', error: 'No audio was recorded.' });
        return;
      }

      const wav = encodeWav(samples, sampleRate);
      const form = new FormData();
      form.append('file', wav, 'speech.wav');

      controller = new AbortController();

      try {
        const response = await fetch('/api/speech/transcribe', {
          method: 'POST',
          body: form,
          signal: controller.signal,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || `Whistle returned HTTP ${response.status}`);
        }

        const recognized = data.text?.trim();

        if (!recognized) {
          throw new Error('Whistle did not recognize speech. Try speaking clearly.');
        }

        publish({
          status: 'idle',
          transcript: state.transcript
            ? `${state.transcript.trim()} ${recognized}`
            : recognized,
          error: '',
        });
      } catch (error) {
        if (!disposed && error.name !== 'AbortError') {
          publish({ status: 'idle', error: error.message });
        }
      }
    },

    dispose() {
      disposed = true;
      controller?.abort();
      cleanup();
    },
  };
}
