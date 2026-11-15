import React, { useCallback, useRef, useState } from 'react';
import useReadAloud from '../../camera/src/accessibility/useReadAloud.js';
import TranslationPanel from '../components/TranslationPanel.jsx';
import { extractDocument } from '../documents/extractDocument.js';

export default function DocumentFeature({ grade, extractor = extractDocument }) {
  const [documentState, setDocumentState] = useState(null);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [state, setState] = useState({ status: 'idle', message: 'Choose a PDF, TXT, or DOCX file.', error: '' });
  const statusRef = useRef(null);
  const announce = useCallback((message) => setState((current) => ({ ...current, message })), []);
  const reader = useReadAloud({ announce });
  const current = documentState?.sections?.[sectionIndex] ?? null;

  async function openFile(file) {
    if (!file) return;
    if (reader.status !== 'idle') reader.stop({ announceStatus: false });
    setDocumentState(null); setSectionIndex(0);
    setState({ status: 'loading', message: `Opening ${file.name}.`, error: '' });
    try {
      const result = await extractor(file, { onStatus: (message) => setState({ status: 'loading', message, error: '' }) });
      setDocumentState(result);
      setState({ status: 'success', message: `${result.name} is ready. ${result.sections.length} ${result.kind === 'pdf' ? 'page' : 'section'}${result.sections.length === 1 ? '' : 's'} extracted${result.usedOcr ? ', including OCR' : ''}.`, error: '' });
      setTimeout(() => statusRef.current?.focus(), 0);
    } catch (error) {
      setState({ status: 'error', message: 'Document extraction failed.', error: error.message || 'Could not read this document.' });
    }
  }

  function editCurrent(text) {
    setDocumentState((value) => ({ ...value, sections: value.sections.map((section, index) => index === sectionIndex ? { ...section, text } : section) }));
  }

  function showSection(next) {
    if (reader.status !== 'idle') reader.stop({ announceStatus: false });
    setSectionIndex(next);
    const section = documentState.sections[next];
    announce(`Showing ${section.label}, ${next + 1} of ${documentState.sections.length}.`);
    setTimeout(() => statusRef.current?.focus(), 0);
  }

  return <section className="feature-workspace" aria-labelledby="document-heading">
    <p className="eyebrow">DOCUMENT TO BRAILLE</p>
    <h1 id="document-heading">Open a document. Review every word.</h1>
    <p className="intro">Extract text privately in your browser from PDF, TXT, or DOCX files, then translate one reviewed page or section at a time.</p>
    <div className="workspace-card document-workspace">
      <div className="document-upload">
        <label className="secondary-button file-button">
          Choose document
          <input type="file" accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            aria-label="Upload PDF, TXT, or DOCX document" disabled={state.status === 'loading'}
            onChange={(event) => { const file = event.target.files?.[0]; if (file) openFile(file); event.target.value = ''; }} />
        </label>
        <p>Maximum 20 MB · PDF up to 100 pages · OCR fallback up to 25 scanned pages</p>
      </div>
      <p ref={statusRef} tabIndex="-1" className="document-status" role="status" aria-live="polite" aria-atomic="true">
        {state.status === 'loading' && <span className="status-spinner" aria-hidden="true" />} {state.message}
      </p>
      {state.error && <p className="error-message" role="alert">{state.error}</p>}
      {documentState?.warnings?.length > 0 && <details className="document-warnings"><summary>Document conversion notes</summary><ul>{documentState.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}

      {current && <>
        <nav className="document-page-controls" aria-label="Document pages and sections">
          <button type="button" className="secondary-button" disabled={sectionIndex === 0} onClick={() => showSection(sectionIndex - 1)}>Previous document section</button>
          <span>{current.label} · {sectionIndex + 1} of {documentState.sections.length}{current.method === 'ocr' ? ' · OCR' : ''}</span>
          <button type="button" className="secondary-button" disabled={sectionIndex === documentState.sections.length - 1} onClick={() => showSection(sectionIndex + 1)}>Next document section</button>
        </nav>
        <div className="transcript-heading">
          <label className="section-label" htmlFor="document-text">Extracted text for {current.label}</label>
          <span>{current.text.length} characters</span>
        </div>
        <textarea id="document-text" className="transcript-input" rows="12" value={current.text}
          onChange={(event) => editCurrent(event.target.value)} placeholder="No text was extracted from this page. You can type text here." />
        <div className="recording-controls read-aloud document-read-controls">
          {reader.status === 'idle' && <button type="button" className="secondary-button" disabled={!current.text.trim()}
            onClick={() => reader.play(current.text, current.id, `document ${current.label}`)}>Read aloud</button>}
          {reader.status === 'playing' && <button type="button" className="secondary-button" onClick={reader.pause}>Pause reading</button>}
          {reader.status === 'paused' && <button type="button" className="secondary-button" onClick={reader.resume}>Resume reading</button>}
          {reader.status !== 'idle' && <button type="button" className="secondary-button" onClick={() => reader.stop()}>Stop reading</button>}
          <span className="reading-status">Reading status: {reader.status}</span>
        </div>
        <TranslationPanel key={`${documentState.name}-${sectionIndex}`} text={current.text} source="text" sourceLabel="document" grade={grade}
          label={`Translate ${current.label} to Braille`} />
      </>}
      <p className="privacy-note">Documents are processed in this browser. Files are not uploaded to a third-party extraction service. Only text you choose to translate is sent to the local Braille API.</p>
    </div>
  </section>;
}
