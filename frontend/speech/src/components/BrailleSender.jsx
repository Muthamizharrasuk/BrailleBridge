import React, { useCallback, useEffect, useRef, useState } from 'react';
import { translateSpeech } from '../braille/client.js';
import { demoMessages, translateDemoSpeech } from '../braille/fixtures.js';
import BraillePreview from './BraillePreview.jsx';
import CompressionReview from './CompressionReview.jsx';

export default function BrailleSender({ text, listening, onUseSample }) {
  const [adapter, setAdapter] = useState(import.meta.env.VITE_BRAILLE_MODE === 'mock' ? 'demo' : 'real');
  const [mode, setMode] = useState('verbatim');
  const [approved, setApproved] = useState(null);
  const [state, setState] = useState({ status: 'idle', error: '', result: null });
  const request = useRef({ id: 0, controller: null });
  const translate = useCallback((message, options = {}) => (
    adapter === 'demo' ? translateDemoSpeech(message, options) : translateSpeech(message, {
      ...options, endpoint: import.meta.env.VITE_BRAILLE_API_URL || '/api/braille/translate',
    })
  ), [adapter]);

  useEffect(() => {
    request.current.id += 1;
    request.current.controller?.abort();
    setState({ status: 'idle', error: '', result: null });
    setApproved(null);
    return () => {
      request.current.id += 1;
      request.current.controller?.abort();
    };
  }, [text, adapter, listening, mode]);

  async function send() {
    if (!text.trim() || listening || state.status === 'loading') return;
    const id = ++request.current.id;
    const controller = new AbortController();
    request.current.controller = controller;
    setState({ status: 'loading', error: '', result: null });
    try {
      const submittedText = mode === 'compressed' && approved ? approved : text;
      const submittedMode = mode === 'compressed' && approved ? 'compressed' : 'verbatim';
      const result = await translate(submittedText, { signal: controller.signal, mode: submittedMode });
      if (id === request.current.id) setState({ status: 'success', error: '', result, submittedText, submittedMode });
    } catch (error) {
      if (id === request.current.id && !controller.signal.aborted) {
        setState({ status: 'error', error: error.message || 'Could not translate this message. Please try again.', result: null });
      }
    }
  }

  function changeApproval(candidate) {
    request.current.id += 1;
    request.current.controller?.abort();
    setApproved(candidate);
    setState({ status: 'idle', error: '', result: null });
  }

  return <section className="braille-sender" aria-labelledby="send-heading">
    <h2 id="send-heading">Send your reviewed message</h2>
    <label className="section-label" htmlFor="braille-adapter">Translation source</label>
    <select id="braille-adapter" value={adapter} onChange={(event) => setAdapter(event.target.value)}>
      <option value="demo">Demo fixtures (no API needed)</option>
      <option value="real">Real Braille API</option>
    </select>
    <label className="section-label" htmlFor="speech-mode">Message mode</label>
    <select id="speech-mode" value={mode} onChange={(event) => setMode(event.target.value)}>
      <option value="verbatim">Verbatim (original text)</option>
      <option value="compressed">Concise (review before use)</option>
    </select>
    {mode === 'compressed' && <CompressionReview text={text} listening={listening} translate={translate} onApprove={changeApproval} onOriginal={() => changeApproval(null)} />}
    <p className="support-note">Will send: {mode === 'compressed' && approved ? 'approved concise text (compressed mode)' : 'original transcript unchanged (verbatim mode)'}.</p>
    {adapter === 'demo' ? <div className="demo-notice">
      <p><strong>Demo data only.</strong> Fixed samples support exactly <q>Hello</q> and <q>Hi</q>. Other messages need the real API. Samples replace your transcript.</p>
      <div className="sample-controls">{demoMessages.map((sample) => <button className="secondary-button" key={sample} type="button" disabled={listening} onClick={() => onUseSample(sample)}>Use sample: {sample}</button>)}</div>
    </div> : <p className="support-note">Sends the selected text to the configured API using Grade 1. The translation service must be running; failures never switch to demo data.</p>}
    <button className="primary-button send-button" type="button" disabled={!text.trim() || listening || state.status === 'loading'} onClick={send}>
      {state.status === 'loading' ? 'Translating...' : 'Send to Braille'}
    </button>
    {state.status === 'loading' && <p role="status">Waiting for the Braille API...</p>}
    {state.error && <p className="error-message" role="alert">{state.error}</p>}
    {state.result && <><p>Sent mode: {state.submittedMode}</p><BraillePreview key={request.current.id} translation={state.result} text={state.submittedText} demo={adapter === 'demo'} /></>}
  </section>;
}
