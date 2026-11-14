import React from 'react';
import { useSpeechRecognition } from '../speech/useSpeechRecognition.js';
import BrailleSender from './BrailleSender.jsx';

const statuses = {
  idle: 'Ready when you are',
  requesting: 'Waiting for microphone permission...',
  listening: 'Listening...',
  stopping: 'Finishing your transcript...',
};

function MicrophoneIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
  </svg>;
}

export default function SpeechPanel() {
  const speech = useSpeechRecognition();
  const busy = speech.status !== 'idle';

  return <section className="speech-panel" aria-labelledby="speech-heading">
    <div className="eyebrow">CONVERSATION / SPEECH TO BRAILLE</div>
    <h1 id="speech-heading">A conversation starts<br />with your words.</h1>
    <p className="intro">Speak naturally. Review your transcript and make it yours.</p>

    <div className="capture-card">
      <div className="capture-heading">
        <span className="section-label">Speech to text</span>
        <span className="language-tag">English (US)</span>
      </div>
      <p className="support-note">{speech.message}</p>
      <div className="recording-controls">
        <button className="primary-button" type="button" onClick={speech.start} disabled={!speech.supported || busy}>
          <MicrophoneIcon /> Start Listening
        </button>
        <button className="secondary-button" type="button" onClick={speech.stop} disabled={!busy || speech.status === 'stopping'}>
          <span className="stop-icon" aria-hidden="true" /> Stop Listening
        </button>
      </div>
      <p className={`listening-status ${speech.status === 'listening' ? 'is-listening' : ''}`} role="status" aria-live="polite">
        <span className="status-dot" aria-hidden="true" />{statuses[speech.status]}
      </p>
      {speech.error && <p className="error-message" role="alert">{speech.error}</p>}
      {speech.interim && <div className="live-preview"><span className="section-label">Live preview</span><p>{speech.interim}</p></div>}
    </div>

    <div className="transcript-heading">
      <label className="section-label" htmlFor="speech-transcript">Your transcript</label>
      <button className="text-button" type="button" onClick={() => speech.setTranscript('')} disabled={busy || !speech.transcript}>Clear transcript</button>
    </div>
    <textarea
      id="speech-transcript"
      className="transcript-input"
      placeholder="Your words will appear here. You can also type a message."
      value={speech.transcript}
      onChange={(event) => speech.setTranscript(event.target.value)}
      readOnly={busy}
      aria-describedby="transcript-help transcript-count"
      rows={6}
      spellCheck="true"
    />
    <div className="transcript-meta">
      <span id="transcript-help">{busy ? 'Stop listening to edit your transcript.' : 'Review and edit freely. Your words are preserved.'}</span>
      <span id="transcript-count">{Array.from(speech.transcript).length} characters</span>
    </div>
    <p className="privacy-note">Your browser provides speech recognition and may send audio to its speech service. Text is sent to the translation service only when you choose the real API and select Send to Braille.</p>
    <BrailleSender text={speech.transcript} listening={busy} onUseSample={speech.setTranscript} />
  </section>;
}
