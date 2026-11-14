import React from 'react';

export default function AccessibleFeedback({ feedback }) {
  return <section className="accessibility-settings" aria-labelledby="feedback-heading">
    <h2 id="feedback-heading">Accessible feedback</h2>
    <p className="support-note">Interface updates are always shown as text and announced by your screen reader. Extra app speech is optional; leave it off while using VoiceOver or TalkBack to prevent overlapping speech.</p>
    <div className="preference-controls">
      <label><input type="checkbox" checked={feedback.spokenGuidance}
        onChange={(event) => feedback.setSpokenGuidance(event.target.checked)} /> Spoken camera guidance</label>
      <label><input type="checkbox" checked={feedback.haptics && feedback.hapticsSupported} disabled={!feedback.hapticsSupported}
        onChange={(event) => feedback.setHaptics(event.target.checked)} />
        {feedback.hapticsSupported ? ' Vibration feedback' : ' Vibration unavailable in this browser'}</label>
    </div>
    <p className="accessible-status" role="status" aria-live="polite" aria-atomic="true">
      <span className="section-label">Current status:</span> {feedback.status}
    </p>
  </section>;
}
