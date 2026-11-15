import React, { useEffect, useRef, useState } from 'react';
import TranslationPanel from '../components/TranslationPanel.jsx';
import { getLocalAIStatus, simplifyWithLocalAI } from '../ai/client.js';

export default function TextFeature({ grade }) {
  const [text, setText] = useState('');
  const [simplified, setSimplified] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  const [ai, setAI] = useState({ state: 'checking', loading: false, error: '' });
  const request = useRef(null);

  async function checkAI() {
    try {
      const status = await getLocalAIStatus();
      setAI((current) => ({ ...current, state: status.connected ? 'connected' : 'disconnected', error: status.error || '' }));
    } catch (error) {
      setAI((current) => ({ ...current, state: 'disconnected', error: error.message }));
    }
  }
  useEffect(() => { checkAI(); return () => request.current?.abort(); }, []);

  async function simplify() {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setAI((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await simplifyWithLocalAI(text, { signal: controller.signal });
      setSimplified(result);
      setHasDraft(true);
      setAI({ state: 'connected', loading: false, error: '' });
    } catch (error) {
      if (!controller.signal.aborted) setAI((current) => ({ ...current, state: 'disconnected', loading: false, error: error.message }));
    }
  }

  function changeOriginal(value) {
    setText(value);
    setSimplified('');
    setHasDraft(false);
    setAI((current) => ({ ...current, error: '' }));
  }
  return <section className="feature-workspace" aria-labelledby="text-heading">
    <p className="eyebrow">TEXT TO BRAILLE</p>
    <h1 id="text-heading">Turn written words into Braille.</h1>
    <p className="intro">Type or paste text, choose a Braille grade, and review the exact three-cell output.</p>
    <div className="workspace-card">
      <div className="transcript-heading">
        <label className="section-label" htmlFor="text-input">Your text</label>
        <button type="button" className="text-button" disabled={!text} onClick={() => changeOriginal('')}>Clear</button>
      </div>
      <textarea id="text-input" className="transcript-input" rows="7" value={text} onChange={(event) => changeOriginal(event.target.value)}
        placeholder="Type or paste text to translate…" aria-describedby="text-help text-count" />
      <div className="transcript-meta"><span id="text-help">Your text is translated verbatim.</span><span id="text-count">{text.length} characters</span></div>
      <TranslationPanel text={text} source="text" grade={grade} />
      <section className="local-ai-panel" aria-labelledby="local-ai-heading">
        <div className="local-ai-heading">
          <div><p className="eyebrow">OPTIONAL LOCAL AI</p><h2 id="local-ai-heading">Simplify with UNO Q AI</h2></div>
          <p className="ai-connection" role="status"><span className={`status-indicator ${ai.state}`} aria-hidden="true" />{ai.state === 'connected' ? 'Local AI connected' : ai.state === 'checking' ? 'Checking local AI' : 'Local AI disconnected'}</p>
        </div>
        <p>Your original text is preserved. Review and edit the local AI draft before translating it.</p>
        <div className="hardware-actions">
          <button type="button" className="secondary-button" onClick={simplify} disabled={!text.trim() || ai.loading}>{ai.loading ? 'Simplifying locally…' : 'Simplify with UNO Q AI'}</button>
          <button type="button" className="text-button" onClick={checkAI} disabled={ai.loading}>Check local AI connection</button>
        </div>
        {ai.loading && <p className="inline-status" role="status">UNO Q is simplifying your text locally…</p>}
        {ai.error && <p className="error-message" role="alert">{ai.error} Your original text is unchanged.</p>}
        {hasDraft && <div className="simplified-draft">
          <label className="section-label" htmlFor="simplified-text">UNO Q simplified draft</label>
          <textarea id="simplified-text" className="transcript-input" rows="6" value={simplified} onChange={(event) => setSimplified(event.target.value)} />
          <div className="transcript-meta"><span>Edit this draft before approval.</span><span>{simplified.length} characters</span></div>
          <TranslationPanel text={simplified} source="text" sourceLabel="UNO Q simplified text" grade={grade} label="Translate approved simplified text" />
        </div>}
      </section>
    </div>
  </section>;
}
