import React from 'react';

export default function DocumentFeature() {
  return <section className="feature-workspace" aria-labelledby="document-heading">
    <p className="eyebrow">DOCUMENT TO BRAILLE</p>
    <h1 id="document-heading">Document import is planned.</h1>
    <p className="intro">This repository does not yet contain a PDF or document text-extraction implementation.</p>
    <div className="workspace-card unavailable-panel" role="status">
      <h2>Not available yet</h2>
      <p>For now, copy text from your document into Text-to-Braille. A future importer can connect here without changing the shared translation or Braille preview.</p>
      <a className="secondary-button inline-link" href="#text">Open Text-to-Braille</a>
    </div>
  </section>;
}
