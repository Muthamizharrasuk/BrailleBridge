import React, { useEffect, useState } from 'react';
import BrailleCell from './BrailleCell.jsx';
import { formatSerialCommand } from './brailleSerial.js';

export default function UnifiedBraillePreview({ translation, text, grade, source }) {
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => setPageIndex(0), [translation]);
  const pages = translation?.pages ?? [];
  const page = pages[pageIndex] ?? [0, 0, 0];
  const serial = pages.length ? formatSerialCommand(page) : '';

  return <section className="output-panel" aria-labelledby="braille-output-heading">
    <div className="section-heading-row">
      <div><p className="eyebrow">BRAILLE OUTPUT</p><h2 id="braille-output-heading">Translation preview</h2></div>
      <span className="grade-badge">Grade {grade}</span>
    </div>
    <p className="output-source">From {source}: <q>{text}</q></p>
    <p className="braille-unicode" aria-label={`Braille Unicode: ${translation.braille_unicode}`}>
      {translation.braille_unicode || '(No Braille cells returned)'}
    </p>
    <p className="support-note">{translation.cell_count} Braille cells · {pages.length} three-cell hardware pages</p>
    {pages.length > 0 && <>
      <div className="unified-cells" aria-label={`Three-cell Braille page ${pageIndex + 1}`}>
        {page.map((mask, index) => <BrailleCell key={index} mask={mask} padded={pageIndex * 3 + index >= translation.cell_count} />)}
      </div>
      <div className="page-controls" aria-label="Three-cell Braille pagination">
        <button className="secondary-button" type="button" disabled={pageIndex === 0} onClick={() => setPageIndex((value) => value - 1)}>Previous Braille page</button>
        <span aria-live="polite">Braille page {pageIndex + 1} of {pages.length}</span>
        <button className="secondary-button" type="button" disabled={pageIndex === pages.length - 1} onClick={() => setPageIndex((value) => value + 1)}>Next Braille page</button>
      </div>
    </>}
    <div className="hardware-preview">
      <div><span className="status-indicator simulated" aria-hidden="true" /> <strong>Simulator active</strong></div>
      <p>Physical Braille hardware is not connected. This command is a preview for future Arduino serial integration.</p>
      <code>{serial ? JSON.stringify(serial) : 'No command yet'}</code>
    </div>
  </section>;
}
