import React, { useEffect, useState } from 'react';
import BrailleCell from './BrailleCell.jsx';
import { formatSerialCommand } from './brailleSerial.js';
import { threeCellsToMotorColumns } from '../hardware/brailleColumns.js';
import { sendHardwarePage, getDisplayStatus, loadDisplay, nextDisplayPage, previousDisplayPage, restartDisplay } from '../hardware/client.js';
import useHardwareStatus from '../hardware/useHardwareStatus.js';

export default function UnifiedBraillePreview({ translation, text, grade, source }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [displaySyncError, setDisplaySyncError] = useState('');
  const [sendStatus, setSendStatus] = useState('');
  const { status: hardware, check: checkHardware, setStatus: setHardware } = useHardwareStatus();
  useEffect(() => {
    let cancelled = false;
    setPageIndex(0);
    if (!translation) return;

    loadDisplay(translation.cells).then((state) => {
      if (!cancelled) {
        setPageIndex(Math.max(0, Math.min(translation.pages.length - 1, Number.isFinite(state?.page) ? state.page - 1 : 0)));
        setDisplaySyncError('');
      }
    }).catch((error) => {
      if (!cancelled) setDisplaySyncError(error.message);
    });

    return () => { cancelled = true; };
  }, [translation]);

  useEffect(() => {
    if (!translation) return;

    const timer = setInterval(() => {
      getDisplayStatus().then((state) => {
        if (state.total === translation.pages.length) {
          setPageIndex(Math.max(0, Math.min(pages.length - 1, Number.isFinite(state?.page) ? state.page - 1 : 0)));
        }
      }).catch(() => {});
    }, 500);

    return () => clearInterval(timer);
  }, [translation]);

  async function navigate(action) {
    try {
      const state = await action();
      setPageIndex(Math.max(0, Math.min(pages.length - 1, Number.isFinite(state?.page) ? state.page - 1 : 0)));
      setDisplaySyncError('');
    } catch (error) {
      setDisplaySyncError(error.message);
    }
  }
  useEffect(() => setSendStatus(''), [translation, pageIndex]);
  const pages = translation?.pages ?? [];
  const page = pages[pageIndex] ?? [0, 0, 0];
  const serial = pages.length ? formatSerialCommand(page) : '';
  const motorColumns = pages.length ? threeCellsToMotorColumns(page) : [];

  async function sendPage() {
    setSending(true); setSendStatus('Sending selected Braille page…');
    try {
      const result = await sendHardwarePage(page);
      setHardware((current) => ({ ...current, state: 'connected', connected: true, message: 'Arduino connected.' }));
      setSendStatus(result.duplicate
        ? 'This Braille page is already displayed; no duplicate command was sent.'
        : `Page sent. Arduino replied: ${result.response}`);
    } catch (error) {
      setHardware((current) => ({ ...current, state: 'disconnected', connected: false, message: error.message }));
      setSendStatus(`Could not send page: ${error.message}`);
    } finally { setSending(false); }
  }

  async function resetDisplay() {
    setSending(true);
    setSendStatus('Resetting physical Braille display…');
    try {
      const result = await sendHardwarePage([0, 0, 0]);
      setSendStatus(`Physical display reset. Arduino replied: ${result.response}`);
    } catch (error) {
      setSendStatus(`Could not reset display: ${error.message}`);
    } finally {
      setSending(false);
    }
  }

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
        <button className="secondary-button" type="button" disabled={pageIndex === 0} onClick={() => navigate(previousDisplayPage)}>Previous Braille page</button>
        <span aria-live="polite">Braille page {pageIndex + 1} of {pages.length}</span>
        <button className="secondary-button" type="button" onClick={() => navigate(restartDisplay)}>Restart</button>
        <button className="secondary-button" type="button" disabled={pageIndex === pages.length - 1} onClick={() => navigate(nextDisplayPage)}>Next Braille page</button>
      </div>
    </>}
    {displaySyncError && <p className="error-message" role="alert">{displaySyncError}</p>}
    <div className="hardware-preview">
      <div><span className={`status-indicator ${hardware.state}`} aria-hidden="true" /> <strong>{hardware.state === 'connected' ? 'Arduino connected' : hardware.state === 'simulation' ? 'Simulator active' : hardware.state === 'checking' ? 'Checking hardware' : 'Arduino disconnected'}</strong></div>
      <p>{hardware.message}</p>
      <code>{serial ? JSON.stringify(serial) : 'No command yet'}</code>
      <div className="hardware-actions">
        <button type="button" className="primary-button" onClick={sendPage} disabled={!hardware.connected || sending || !pages.length}>{sending ? 'Sending…' : 'Send selected page to Arduino'}</button>
        <button type="button" className="secondary-button" onClick={resetDisplay} disabled={!hardware.connected || sending}>{sending ? 'Please wait…' : 'Reset Display'}</button>
        <button type="button" className="secondary-button" onClick={checkHardware} disabled={sending}>Check connection</button>
      </div>
      <p className="hardware-send-status" role="status" aria-live="polite">{sendStatus}</p>
      {motorColumns.length > 0 && <details className="motor-preview">
        <summary>Six-motor column preview</summary>
        <ol>{motorColumns.map((pattern, index) => <li key={index}>Motor {index + 1}: <code>{pattern.toString(2).padStart(3, '0')}</code></li>)}</ol>
        <p>Servo positions and pins are not calibrated yet.</p>
      </details>}
    </div>
  </section>;
}
