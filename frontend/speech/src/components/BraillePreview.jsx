import React, { useState } from 'react';

function Cell({ mask, padded }) {
  const dots = [1, 2, 3, 4, 5, 6].filter((dot) => mask & (1 << (dot - 1)));
  return <div className="braille-cell">
    <div className="dot-cell" role="img" aria-label={padded ? 'Padding cell' : dots.length ? `Dots ${dots.join(', ')}` : 'Blank cell'}>
      {[1, 4, 2, 5, 3, 6].map((dot) => <span key={dot} className={`braille-dot ${dots.includes(dot) ? 'raised' : ''}`} />)}
    </div>
    <span className="mask-label">{padded ? 'Padding' : `Mask ${mask}`}</span>
  </div>;
}

export default function BraillePreview({ translation, text, demo }) {
  const [page, setPage] = useState(0);
  return <section className="braille-preview" aria-labelledby="braille-preview-heading">
    <div className="capture-heading">
      <h2 id="braille-preview-heading">Braille preview</h2>
      <span className="language-tag">{demo ? 'Demo fixture' : 'API response'}</span>
    </div>
    <p className="preview-text">Message: <q>{text}</q></p>
    <p className="braille-unicode" aria-label={`Braille Unicode: ${translation.braille_unicode}`}>{translation.braille_unicode || '(No Braille cells returned)'}</p>
    <p className="support-note">{translation.cell_count} Braille cells · {translation.pages.length} three-cell pages · Grade 1</p>
    {translation.pages.length > 0 && <>
      <div className="braille-page" aria-label={`Three-cell page ${page + 1}`}>
        {translation.pages[page].map((mask, index) => <Cell key={index} mask={mask} padded={page * 3 + index >= translation.cell_count} />)}
      </div>
      <div className="page-controls">
        <button className="secondary-button" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous page</button>
        <span aria-live="polite">Page {page + 1} of {translation.pages.length}</span>
        <button className="secondary-button" type="button" disabled={page === translation.pages.length - 1} onClick={() => setPage(page + 1)}>Next page</button>
      </div>
    </>}
    <p className="privacy-note">Visual preview only. No hardware transmission is connected.</p>
  </section>;
}
