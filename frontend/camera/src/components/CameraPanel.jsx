import React, { useEffect, useRef, useState } from 'react';
import BraillePreview from '../../../speech/src/components/BraillePreview.jsx';
import { translateCamera } from '../braille/cameraClient.js';
import { recognizeBest, validateImageFile } from '../ocr/ocr.js';
import { buildReport } from '../ocr/report.js';
import { browserTools } from '../ocr/imageTools.js';
import { speak } from './speak.js';
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
  const [imageUrl, setImageUrl] = useState('');
  const [text, setText] = useState('');
  const [ocrState, setOcrState] = useState({ status: 'idle', progress: 0, label: '' });
  const [note, setNote] = useState(null);
  const [scan_, setScanInfo] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [ocrError, setOcrError] = useState('');
  const [api, setApi] = useState({ status: 'idle', error: '', result: null, sentText: '' });
  const run = useRef(0);
  const sendRun = useRef(0);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  async function scan(file) {
    const id = ++run.current;
    sendRun.current += 1; // invalidate in-flight translation
    setOcrError(''); setCameraError(''); setNote(null); setScanInfo(null);
    setApi({ status: 'idle', error: '', result: null, sentText: '' });
    try { validateImageFile(file); } catch (e) { setOcrError(e.message); return; }
    setOcrState({ status: 'working', progress: 0, label: 'Opening the photo…' });
    try {
      // Browsers cannot open every format (e.g. iPhone HEIC); convert or explain before OCR.
      if (tools?.prepare) file = await tools.prepare(file);
      if (id !== run.current) return;
      setImageUrl(URL.createObjectURL(file));
      setOcrState({ status: 'working', progress: 0, label: 'Reading the page…' });
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
      setText(extracted);
      if (typeof out !== 'string') {
        setScanInfo({
          rawText: out.rawText ?? extracted, removed: out.removed ?? [], flagged: out.flagged ?? [],
          corrections: out.corrections ?? [], gaps: out.gaps ?? [], correctedText: extracted, uncorrectedText: out.uncorrectedText ?? extracted,
        });
        const report = buildReport({ ...out, lineCount: out.lineCount ?? extracted.split('\n').length });
        const photoAdvice = report.level !== 'reliable' && quality && !quality.ok ? ` ${quality.message}` : '';
        const message = report.spoken + photoAdvice;
        setNote({ level: report.level, message, confidence: Math.round(out.confidence), attempts: out.attempts });
        speak(message);
      }
    } catch (e) {
      if (id === run.current) { setOcrError(e.message); speak(e.message); }
    } finally {
      if (id === run.current) setOcrState({ status: 'idle', progress: 0, label: '' });
    }
  }

  async function send() {
    const id = ++sendRun.current;
    setApi({ status: 'loading', error: '', result: null, sentText: '' });
    try {
      const result = await translate(text);
      if (id === sendRun.current) setApi({ status: 'success', error: '', result, sentText: text });
    } catch (e) {
      if (id === sendRun.current) setApi({ status: 'error', error: e.message, result: null, sentText: '' });
    }
  }

  function edit(value) {
    setText(value);
    sendRun.current += 1; // a result for older text must not look current
    setApi({ status: 'idle', error: '', result: null, sentText: '' });
  }

  const scanning = ocrState.status === 'working';
  return <section className="speech-panel camera-panel">
    <p className="eyebrow">CAMERA TO BRAILLE</p>
    <h1>Read a printed page in Braille</h1>
    <p className="intro">Photograph or upload printed text, fix any scanning mistakes, then send it to the Braille display.</p>

    <div className="capture-card">
      <div className="capture-heading"><span className="section-label">1. Add a photo</span><span className="language-tag">English · Grade 1</span></div>
      <div className="camera-actions">
        <label className="secondary-button file-button">
          Upload image
          <input type="file" accept="image/*" aria-label="Upload image" disabled={scanning}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) scan(f); e.target.value = ''; }} />
        </label>
        <WebcamCapture disabled={scanning} onError={setCameraError} onCapture={(blob) => scan(blob)} />
      </div>
      {cameraError && <p className="error-message" role="alert">{cameraError}</p>}
      {imageUrl && <img className="scan-image" src={imageUrl} alt="Photo being scanned" />}
      {scanning && <p className="listening-status is-listening" role="status"><span className="status-dot" />{ocrState.label} {Math.round(ocrState.progress * 100)}%</p>}
      {ocrError && <p className="error-message" role="alert">{ocrError}</p>}
      {note && <p className={`scan-note scan-${note.level}`} role="status" data-confidence={note.confidence} data-attempts={note.attempts}>{note.message}</p>}

      {scan_ && <ScanDetails info={scan_} text={text} onUndo={() => edit(scan_.uncorrectedText)} />}

      <div className="transcript-heading">
        <label className="section-label" htmlFor="ocr-text">2. Check the text</label>
        {text && <button type="button" className="text-button" onClick={() => edit('')}>Clear</button>}
      </div>
      <textarea id="ocr-text" className="transcript-input" value={text} disabled={scanning}
        placeholder="Scanned text appears here. You can also type or paste text." onChange={(e) => edit(e.target.value)} />
      {text.trim() && <div className="recording-controls read-aloud">
        <button type="button" className="secondary-button" onClick={() => speak(text)}>Read the text aloud</button>
        <button type="button" className="secondary-button" onClick={() => speak('')}>Stop reading</button>
      </div>}
      <div className="transcript-meta"><span>OCR can misread characters. Correct them before translating.</span><span>{text.length} characters</span></div>

      <button type="button" className="primary-button send-button" onClick={send} disabled={!text.trim() || scanning || api.status === 'loading'}>
        {api.status === 'loading' ? 'Translating…' : '3. Translate to Braille'}
      </button>
      {api.error && <p className="error-message" role="alert">{api.error}</p>}
    </div>

    {api.result && <BraillePreview key={api.sentText} translation={api.result} text={api.sentText} demo={false} />}
  </section>;
}
