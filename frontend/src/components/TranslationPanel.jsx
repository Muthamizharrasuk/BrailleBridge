import React, { useEffect, useRef, useState } from 'react';
import { translateToBraille } from '../braille/client.js';
import UnifiedBraillePreview from './UnifiedBraillePreview.jsx';

export default function TranslationPanel({ text, source, sourceLabel = source, grade, disabled = false, label = 'Translate to Braille' }) {
  const [state, setState] = useState({ status: 'idle', error: '', result: null, submittedText: '' });
  const request = useRef({ id: 0, controller: null });
  useEffect(() => {
    request.current.id += 1; request.current.controller?.abort();
    setState({ status: 'idle', error: '', result: null, submittedText: '' });
  }, [text, grade]);
  useEffect(() => () => request.current.controller?.abort(), []);

  async function submit() {
    const id = ++request.current.id;
    const controller = new AbortController(); request.current.controller = controller;
    setState({ status: 'loading', error: '', result: null, submittedText: '' });
    try {
      const result = await translateToBraille(text, { source, grade, signal: controller.signal });
      if (id === request.current.id) setState({ status: 'success', error: '', result, submittedText: text });
    } catch (error) {
      if (id === request.current.id && !controller.signal.aborted) setState({ status: 'error', error: error.message || 'Translation failed.', result: null, submittedText: '' });
    }
  }

  return <>
    <button className="primary-button translate-button" type="button" onClick={submit} disabled={disabled || !text.trim() || state.status === 'loading'}>
      {state.status === 'loading' ? 'Translating…' : label}
    </button>
    {state.status === 'loading' && <p className="inline-status" role="status">Translating with Liblouis…</p>}
    {state.error && <p className="error-message" role="alert">{state.error}</p>}
    {state.result && <UnifiedBraillePreview translation={state.result} text={state.submittedText} grade={grade} source={sourceLabel} />}
  </>;
}
