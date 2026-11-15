import React from 'react';
import { useSpeechRecognition } from '../../speech/src/speech/useSpeechRecognition.js';
import TranslationPanel from '../components/TranslationPanel.jsx';

const labels = { idle: 'Ready for speech', requesting: 'Waiting for microphone permission…', listening: 'Listening…', stopping: 'Finishing transcript…' };

export default function SpeechFeature({ grade }) {
  const speech = useSpeechRecognition();
  const busy = speech.status !== 'idle';
  return <section className="feature-workspace" aria-labelledby="speech-heading">
    <p className="eyebrow">SPEECH TO BRAILLE</p>
    <h1 id="speech-heading">Speak, review, translate.</h1>
    <p className="intro">Use your browser microphone, then correct the transcript before sending it to Liblouis.</p>
    <div className="workspace-card">
      <div className="section-heading-row"><span className="section-label">Microphone</span><span className="grade-badge">English (US)</span></div>
      <p className="support-note">{speech.message}</p>
      <div className="recording-controls">
        <button className="primary-button" type="button" onClick={speech.start} disabled={!speech.supported || busy}>Start listening</button>
        <button className="secondary-button" type="button" onClick={speech.stop} disabled={!busy || speech.status === 'stopping'}>Stop listening</button>
      </div>
      <p className={`listening-status ${speech.status === 'listening' ? 'is-listening' : ''}`} role="status" aria-live="polite">
        <span className="status-dot" aria-hidden="true" />{labels[speech.status]}
      </p>
      {speech.error && <p className="error-message" role="alert">{speech.error}</p>}
      {speech.interim && <div className="live-preview"><span className="section-label">Live preview</span><p>{speech.interim}</p></div>}
      <div className="transcript-heading">
        <label className="section-label" htmlFor="speech-input">Review transcript</label>
        <button type="button" className="text-button" disabled={busy || !speech.transcript} onClick={() => speech.setTranscript('')}>Clear</button>
      </div>
      <textarea id="speech-input" className="transcript-input" rows="7" value={speech.transcript} readOnly={busy}
        onChange={(event) => speech.setTranscript(event.target.value)} placeholder="Your speech appears here. You can also type." />
      <div className="transcript-meta"><span>{busy ? 'Stop listening before editing.' : 'Review the transcript before translating.'}</span><span>{speech.transcript.length} characters</span></div>
      <TranslationPanel text={speech.transcript} source="speech" grade={grade} disabled={busy} />
      <p className="privacy-note">Speech recognition is provided by your browser and may use its speech service. Only reviewed text is sent to the Braille API.</p>
    </div>
  </section>;
}
