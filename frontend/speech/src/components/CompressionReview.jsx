import React, { useEffect, useRef, useState } from 'react';
import { evaluateCompression, requestCompression } from '../speech/compression.js';

export default function CompressionReview({ text, listening, translate, onApprove, onOriginal }) {
  const [state, setState] = useState({ status: 'idle' });
  const task = useRef({ id: 0, controller: null });
  useEffect(() => {
    setState({ status: 'idle' });
    return () => { task.current.id += 1; task.current.controller?.abort(); };
  }, [text, listening, translate]);

  async function propose() {
    const id = ++task.current.id;
    const controller = new AbortController();
    task.current.controller = controller;
    onOriginal();
    setState({ status: 'loading' });
    try {
      const result = await requestCompression(text, { signal: controller.signal });
      if (id !== task.current.id) return;
      if (result.status === 'fallback') {
        setState({ status: 'fallback', reason: result.reason });
        return;
      }
      setState({ status: 'evaluating', candidate: result.text });
      const counts = await evaluateCompression(text, result.text, translate, { signal: controller.signal });
      if (id === task.current.id) setState({ status: 'review', candidate: result.text, ...counts });
    } catch {
      if (id === task.current.id) setState({ status: 'fallback', reason: 'Compression failed. Your original message will be used unchanged.' });
    }
  }
  const pending = ['loading', 'evaluating'].includes(state.status);
  const noSaving = state.reduction !== null && state.reduction !== undefined && state.reduction <= 0;
  return <section className="compression-review" aria-label="Concise message review">
    <p className="support-note">Optional AI compression may change meaning. Review names, numbers, times, negation, and warnings. Semantic equivalence is not guaranteed. Your transcript stays unchanged.</p>
    <button type="button" className="secondary-button" disabled={!text.trim() || listening || pending} onClick={propose}>Suggest concise version</button>
    {pending && <p role="status">{state.status === 'evaluating' ? 'Comparing actual Braille cell counts...' : 'Requesting a concise suggestion...'}</p>}
    {state.status === 'fallback' && <p role="status">{state.reason}</p>}
    {state.candidate && <div className="compression-comparison">
      <h3>Original</h3><p>{text}</p>
      <h3>Concise suggestion</h3><p>{state.candidate}</p>
    </div>}
    {state.status === 'review' && <>
      <p>Original: {state.originalCount ?? 'unavailable'} cells. Concise: {state.compressedCount ?? 'unavailable'} cells.</p>
      <p>{state.reduction === null ? 'Cell reduction unavailable. Check the translation API before relying on savings.' : `Braille cell reduction: ${state.reduction.toFixed(1)}%.`}</p>
      {noSaving && <p>No Braille cells saved. Keep the original message.</p>}
      <div className="sample-controls">
        <button type="button" className="secondary-button" disabled={listening || noSaving} onClick={() => onApprove(state.candidate)}>Approve concise text</button>
        <button type="button" className="secondary-button" onClick={onOriginal}>Use original text</button>
      </div>
    </>}
  </section>;
}
