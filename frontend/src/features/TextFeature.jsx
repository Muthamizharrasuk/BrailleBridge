import React, { useState } from 'react';
import TranslationPanel from '../components/TranslationPanel.jsx';

export default function TextFeature({ grade }) {
  const [text, setText] = useState('');
  return <section className="feature-workspace" aria-labelledby="text-heading">
    <p className="eyebrow">TEXT TO BRAILLE</p>
    <h1 id="text-heading">Turn written words into Braille.</h1>
    <p className="intro">Type or paste text, choose a Braille grade, and review the exact three-cell output.</p>
    <div className="workspace-card">
      <div className="transcript-heading">
        <label className="section-label" htmlFor="text-input">Your text</label>
        <button type="button" className="text-button" disabled={!text} onClick={() => setText('')}>Clear</button>
      </div>
      <textarea id="text-input" className="transcript-input" rows="7" value={text} onChange={(event) => setText(event.target.value)}
        placeholder="Type or paste text to translate…" aria-describedby="text-help text-count" />
      <div className="transcript-meta"><span id="text-help">Your text is translated verbatim.</span><span id="text-count">{text.length} characters</span></div>
      <TranslationPanel text={text} source="text" grade={grade} />
    </div>
  </section>;
}
