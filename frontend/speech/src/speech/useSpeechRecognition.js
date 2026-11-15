import { useEffect, useRef, useState } from 'react';
import { createWhistleRecognition, getSpeechSupport } from './whistleRecognition.js';

export function useSpeechRecognition() {
  const adapter = useRef(null);
  const [state, setState] = useState(() => ({
    ...getSpeechSupport(), status: 'idle', transcript: '', interim: '', error: '',
  }));

  useEffect(() => {
    const instance = createWhistleRecognition({ onChange: setState });
    adapter.current = instance;
    setState(instance.getSnapshot());
    return () => {
      instance.dispose();
      adapter.current = null;
    };
  }, []);

  return {
    ...state,
    start: () => adapter.current?.start(),
    stop: () => adapter.current?.stop(),
    setTranscript: (text) => adapter.current?.setTranscript(text),
  };
}
