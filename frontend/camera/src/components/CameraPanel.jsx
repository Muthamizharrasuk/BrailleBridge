import React, { useEffect, useRef, useState } from 'react';
import BraillePreview from '../../../speech/src/components/BraillePreview.jsx';
import AccessibleFeedback from '../accessibility/AccessibleFeedback.jsx';
import useAccessibleFeedback from '../accessibility/useAccessibleFeedback.js';
import useReadAloud from '../accessibility/useReadAloud.js';
import { translateCamera } from '../braille/cameraClient.js';
import { recognizeBest, validateImageFile } from '../ocr/ocr.js';
import { buildReport } from '../ocr/report.js';
import { browserTools } from '../ocr/imageTools.js';
import WebcamCapture from './WebcamCapture.jsx';

function ScanDetails({ info, text, onUndo }) {
  // Only list words still present in the (possibly edited) text.
  const flagged = info.flagged.filter((f) => text.includes(f.word)).slice(0, 15);
  const canUndo = info.corrections.length > 0 && text === info.correctedText;
  const gaps = info.gaps ?? [];
  if (!flagged.length && !info.removed.length && !info.corrections.length && !gaps.length) return null;
  return <div className="scan-details">
    {info.corrections.length > 0 && <div className="corrections">
      <p className="section-label">Fixed {info.corrections.length} likely misread word{info.corrections.length === 1 ? '' : 's'}</p>
      <ul>{info.corrections.map((c, i) => <li key={i}>“{c.from}” → “{c.to}” on line {c.line}</li>)}</ul>
      {canUndo && <button type="button" className="text-button" onClick={onUndo}>Undo these fixes</button>}
    </div>}
    {gaps.length > 0 && <p className="error-message" role="status">Some text could not be read and is missing near line{gaps.length === 1 ? '' : 's'} {gaps.map((g) => g.line).join(', ')}.</p>}
    {flagged.length > 0 && <div className="check-words">
      <p className="section-label">Please check these words ({flagged.length})</p>
      <ul>{flagged.map((f, i) => <li key={`${f.word}-${i}`}>“{f.word}” on line {f.line}</li>)}</ul>
    </div>}
    {info.removed.length > 0 && <details>
      <summary>Cleaned up {info.removed.length} stray mark{info.removed.length === 1 ? '' : 's'} · show original scan</summary>
      <p className="support-note">Removed: {info.removed.map((r) => `“${r.text}” (${r.reason})`).join(', ')}</p>
      <pre className="raw-scan" tabIndex={0} aria-label="Original scan text">{info.rawText}</pre>
    </details>}
  </div>;
}

// Props allow injection for tests / later integration.
export default function CameraPanel({ ocr = recognizeBest, translate = translateCamera, tools = browserTools }) {
  const feedback = useAccessibleFeedback();
  const reader = useReadAloud({ announce: feedback.announce });
  const [pages, setPages] = useState([]);
  const [pageIndex, setPageIndex] = useState(-1);
  const [draftText, setDraftText] = useState('');
  const [draftApi, setDraftApi] = useState({ status: 'idle', error: '', result: null, sentText: '' });
  const [ocrState, setOcrState] = useState({ status: 'idle', progress: 0, label: '' });
  const [cameraError, setCameraError] = useState('');
  const [ocrError, setOcrError] = useState('');
  const [startSignal, setStartSignal] = useState(0);
  const run = useRef(0);
  const sendRun = useRef(0);
  const nextPageId = useRef(1);
  const textRef = useRef(null);
  const pageHeadingRef = useRef(null);
  const urls = useRef(new Set());

  const current = pageIndex >= 0 ? pages[pageIndex] : null;
  const text = current?.text ?? draftText;
  const api = current?.api ?? draftApi;
  const imageUrl = current?.imageUrl ?? '';
  const note = current?.note ?? null;
  const scan_ = current?.scanInfo ?? null;

  useEffect(() => () => { urls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  function updateCurrent(patch) {
    if (pageIndex < 0) return;
    setPages((all) => all.map((page, index) => index === pageIndex ? { ...page, ...patch } : page));
  }

  async function scan(file, cameraCapture = false) {
    const id = ++run.current;
    sendRun.current += 1; // invalidate in-flight translation
    setOcrError(''); setCameraError('');
    try { validateImageFile(file); } catch (e) { setOcrError(e.message); return; }
    setOcrState({ status: 'working', progress: 0, label: 'Opening the photo…' });
    if (!cameraCapture) feedback.announce('Opening the photo.', { vibrate: 20 });
    let newImageUrl = '';
    try {
      // Browsers cannot open every format (e.g. iPhone HEIC); convert or explain before OCR.
      if (tools?.prepare) file = await tools.prepare(file);
      if (id !== run.current) return;
      newImageUrl = URL.createObjectURL(file);
      urls.current.add(newImageUrl);
      setOcrState({ status: 'working', progress: 0, label: 'Reading the page…' });
      if (!cameraCapture) feedback.announce('Reading the page.');
      // Tell the user right away if the photo looks poor, since they cannot see it.
      let quality = null;
      try { quality = await tools?.assess?.(file); } catch { /* optional */ }
      const out = await ocr(file, {
        tools,
        onProgress: (p) => id === run.current && setOcrState((s) => ({ ...s, progress: p })),
        onStatus: (label) => id === run.current && setOcrState({ status: 'working', progress: 0, label }),
      });
      if (id !== run.current) return;
      const extracted = typeof out === 'string' ? out : out.text;
      let scanInfo = null;
      let pageNote = null;
      if (typeof out !== 'string') {
        scanInfo = {
          rawText: out.rawText ?? extracted, removed: out.removed ?? [], flagged: out.flagged ?? [],
          corrections: out.corrections ?? [], gaps: out.gaps ?? [], correctedText: extracted, uncorrectedText: out.uncorrectedText ?? extracted,
        };
        const report = buildReport({ ...out, lineCount: out.lineCount ?? extracted.split('\n').length });
        const photoAdvice = report.level !== 'reliable' && quality && !quality.ok ? ` ${quality.message}` : '';
        const message = report.spoken + photoAdvice;
        pageNote = { level: report.level, message, confidence: Math.round(out.confidence), attempts: out.attempts };
      }
      const pageId = nextPageId.current++;
      const newPage = { id: pageId, text: extracted, imageUrl: newImageUrl, scanInfo, note: pageNote,
        api: { status: 'idle', error: '', result: null, sentText: '' } };
      setPages((all) => [...all, newPage]);
      setPageIndex(pages.length);
      const confidenceStatus = pageNote ? ` Scanned page ${pageId}. OCR confidence is ${pageNote.level}. Review the scan details.` : ` Scanned page ${pageId}. Check the text before translating.`;
      feedback.announce(`Ready to read.${confidenceStatus}`, { speak: true, vibrate: [40, 40, 40] });
      setTimeout(() => textRef.current?.focus(), 0);
    } catch (e) {
      if (id === run.current) {
        if (newImageUrl) { urls.current.delete(newImageUrl); URL.revokeObjectURL(newImageUrl); }
        setOcrError(e.message);
        feedback.announce(e.message, { speak: true, vibrate: [80, 50, 80] });
      }
    } finally {
      if (id === run.current) setOcrState({ status: 'idle', progress: 0, label: '' });
    }
  }

  async function send() {
    const id = ++sendRun.current;
    const targetPage = current?.id ?? null;
    const loading = { status: 'loading', error: '', result: null, sentText: '' };
    if (current) updateCurrent({ api: loading }); else setDraftApi(loading);
    feedback.announce(`Translating${targetPage ? ` scanned page ${targetPage}` : ' the text'} to Braille.`, { vibrate: 20 });
    try {
      const result = await translate(text);
      if (id === sendRun.current) {
        const success = { status: 'success', error: '', result, sentText: text };
        if (targetPage) setPages((all) => all.map((page) => page.id === targetPage ? { ...page, api: success } : page));
        else setDraftApi(success);
        feedback.announce(`Braille translation ready${targetPage ? ` for scanned page ${targetPage}` : ''}.`, { vibrate: [30, 30, 30] });
      }
    } catch (e) {
      if (id === sendRun.current) {
        const failure = { status: 'error', error: e.message, result: null, sentText: '' };
        if (targetPage) setPages((all) => all.map((page) => page.id === targetPage ? { ...page, api: failure } : page));
        else setDraftApi(failure);
        feedback.announce(e.message, { speak: true, vibrate: [80, 50, 80] });
      }
    }
  }

  function edit(value) {
    sendRun.current += 1; // a result for older text must not look current
    const clearedApi = { status: 'idle', error: '', result: null, sentText: '' };
    if (current) updateCurrent({ text: value, api: clearedApi });
    else { setDraftText(value); setDraftApi(clearedApi); }
  }

  function showPage(index) {
    if (index < 0 || index >= pages.length || index === pageIndex) return;
    if (reader.status !== 'idle') reader.stop({ announceStatus: false });
    setPageIndex(index);
    feedback.announce(`Showing scanned page ${pages[index].id} of ${pages.length}.`, { vibrate: 20 });
    setTimeout(() => pageHeadingRef.current?.focus(), 0);
  }

  function scanNextPage() {
    if (reader.status !== 'idle') reader.stop({ announceStatus: false });
    feedback.announce(`Ready to scan page ${nextPageId.current}. Point the camera at the next page.`, { speak: true, vibrate: 30 });
    setStartSignal((value) => value + 1);
  }

  const scanning = ocrState.status === 'working';
  return <section className="speech-panel camera-panel" aria-labelledby="camera-heading">
    <p className="eyebrow">CAMERA TO BRAILLE</p>
    <h1 id="camera-heading">Read a printed page in Braille</h1>
    <p className="intro">Photograph or upload printed text, fix any scanning mistakes, then send it to the Braille display.</p>

    <AccessibleFeedback feedback={feedback} />

    <div className="capture-card">
      <div className="capture-heading"><span className="section-label">1. Add a photo</span><span className="language-tag">English · Grade 1</span></div>
      <div className="camera-actions">
        <label className="secondary-button file-button">
          Upload image
          <input type="file" accept="image/*" aria-label="Upload image" disabled={scanning}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) scan(f); e.target.value = ''; }} />
        </label>
        <WebcamCapture disabled={scanning} onError={(message) => {
          setCameraError(message);
          if (message) feedback.announce(message, { speak: true, vibrate: [80, 50, 80] });
        }} onCapture={(blob) => scan(blob, true)} announce={feedback.announce} startSignal={startSignal} />
      </div>
      {cameraError && <p className="error-message" role="alert">{cameraError}</p>}
      {imageUrl && <img className="scan-image" src={imageUrl} alt={`Scanned page ${current.id}`} />}
      {scanning && <p className="listening-status is-listening"><span className="status-dot" aria-hidden="true" />{ocrState.label} {Math.round(ocrState.progress * 100)}%</p>}
      {ocrError && <p className="error-message" role="alert">{ocrError}</p>}
      {note && <p className={`scan-note scan-${note.level}`} role="status" aria-live="off" data-confidence={note.confidence} data-attempts={note.attempts}>{note.message}</p>}

      {pages.length > 0 && <nav className="scan-page-controls" aria-label="Scanned book pages">
        <button type="button" className="secondary-button" disabled={pageIndex <= 0} onClick={() => showPage(pageIndex - 1)}>Previous scanned page</button>
        <span ref={pageHeadingRef} tabIndex="-1">Scanned page {pageIndex + 1} of {pages.length}</span>
        <button type="button" className="secondary-button" disabled={pageIndex >= pages.length - 1} onClick={() => showPage(pageIndex + 1)}>Next scanned page</button>
        <button type="button" className="primary-button" aria-label="Start another page scan" onClick={scanNextPage} disabled={scanning}>Scan Next Page</button>
      </nav>}

      {scan_ && <ScanDetails info={scan_} text={text} onUndo={() => edit(scan_.uncorrectedText)} />}

      <div className="transcript-heading">
        <label className="section-label" htmlFor="ocr-text">2. Check the text</label>
        {text && <button type="button" className="text-button" onClick={() => edit('')}>Clear</button>}
      </div>
      <textarea ref={textRef} id="ocr-text" className="transcript-input" value={text} disabled={scanning}
        placeholder="Scanned text appears here. You can also type or paste text." onChange={(e) => edit(e.target.value)} />
      {text.trim() && <div className="recording-controls read-aloud">
        {reader.status === 'idle' && <button type="button" className="secondary-button" onClick={() => reader.play(text, current?.id ?? 'draft')}>Read the text aloud</button>}
        {reader.status === 'playing' && <button type="button" className="secondary-button" onClick={reader.pause}>Pause reading</button>}
        {reader.status === 'paused' && <button type="button" className="secondary-button" onClick={reader.resume}>Resume reading</button>}
        {reader.status !== 'idle' && <button type="button" className="secondary-button" onClick={() => reader.stop()}>Stop reading</button>}
        <span className="reading-status">Reading status: {reader.status}</span>
      </div>}
      <div className="transcript-meta"><span>OCR can misread characters. Correct them before translating.</span><span>{text.length} characters</span></div>

      <button type="button" className="primary-button send-button" onClick={send} disabled={!text.trim() || scanning || api.status === 'loading'}>
        {api.status === 'loading' ? 'Translating…' : '3. Translate to Braille'}
      </button>
      {api.error && <p className="error-message" role="alert">{api.error}</p>}
    </div>

    {api.result && <div aria-label={`Braille translation for ${current ? `scanned page ${current.id}` : 'typed text'}`}>
      <BraillePreview key={`${current?.id ?? 'draft'}-${api.sentText}`} translation={api.result} text={api.sentText} demo={false} />
    </div>}
  </section>;
}
