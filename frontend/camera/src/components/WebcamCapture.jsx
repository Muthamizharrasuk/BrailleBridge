import React, { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeCanvasLike, frameMotionScore } from '../ocr/imageQuality.js';
import { cameraSupported, describeCameraError } from './webcamErrors.js';

export const AUTO_STABLE_MS = 4000;
export const MOTION_THRESHOLD = 12;
export const GUIDANCE_STABLE_SAMPLES = 2;

const defaultAnalyze = (video) => analyzeCanvasLike(video, video.videoWidth, video.videoHeight);

// Live camera with spoken/visible guidance, optional flashlight, and automatic capture,
// so a user who cannot see the preview still gets a usable photo.
export default function WebcamCapture({
  onCapture, onError, disabled, analyze = defaultAnalyze, intervalMs = 300,
  announce, startSignal = 0, initialMode = 'manual', stableDurationMs = AUTO_STABLE_MS,
}) {
  const videoRef = useRef(null);
  const useCameraRef = useRef(null);
  const captureButtonRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [guidance, setGuidance] = useState('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [mode, setMode] = useState(initialMode === 'automatic' ? 'automatic' : 'manual');
  const [countdown, setCountdown] = useState('');
  const candidate = useRef({ key: '', count: 0 });
  const announcedKey = useRef('');
  const stableSince = useRef(null);
  const previousSignature = useRef(null);
  const automaticArmed = useRef(true);
  const done = useRef(false);
  const triedTorch = useRef(false);

  const say = useCallback((key, text, { force = false, vibrate } = {}) => {
    if (!force) {
      if (candidate.current.key === key) candidate.current.count += 1;
      else candidate.current = { key, count: 1 };
      if (candidate.current.count < GUIDANCE_STABLE_SAMPLES || announcedKey.current === key) return;
    }
    candidate.current = { key, count: GUIDANCE_STABLE_SAMPLES };
    announcedKey.current = key;
    setGuidance(text);
    announce?.(text, { speak: true, vibrate });
  }, [announce]);

  const stop = useCallback((restoreFocus = false) => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stableSince.current = null; previousSignature.current = null;
    setActive(false); setTorchOn(false); setTorchSupported(false); setGuidance(''); setCountdown('');
    if (restoreFocus) setTimeout(() => useCameraRef.current?.focus(), 0);
  }, []);
  useEffect(() => () => stop(false), [stop]);

  async function setTorch(on) {
    const track = streamRef.current?.getVideoTracks?.()[0];
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] });
      setTorchOn(on);
      return true;
    } catch { return false; }
  }

  async function start() {
    if (!cameraSupported()) {
      onError('This browser or connection does not allow camera access (it needs https or localhost). Upload a photo instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Ask for high resolution: small text in a low-res frame is the main cause of misreads.
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
      });
      streamRef.current = stream;
      stableSince.current = null; previousSignature.current = null; done.current = false; triedTorch.current = false;
      candidate.current = { key: '', count: 0 }; announcedKey.current = '';
      const track = stream.getVideoTracks?.()[0];
      setTorchSupported(Boolean(track?.getCapabilities?.().torch));
      setActive(true);
      onError('');
      say('cameraReady', mode === 'manual' ? 'Camera ready. Capture when ready.' : 'Camera ready. Hold over the page.', { force: true });
    } catch (error) {
      onError(describeCameraError(error));
    }
  }

  const handledStartSignal = useRef(0);
  useEffect(() => {
    if (startSignal > handledStartSignal.current && !active && !disabled) {
      handledStartSignal.current = startSignal;
      automaticArmed.current = true;
      start();
    }
  }, [startSignal, active, disabled]);

  useEffect(() => {
    if (active && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play?.().catch(() => {});
      setTimeout(() => captureButtonRef.current?.focus(), 0);
    }
  }, [active]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (done.current) return;
    if (!video?.videoWidth) { onError('The camera is not ready yet. Wait a moment and try again.'); return; }
    done.current = true;
    // Any captured page consumes the automatic-capture allowance. Only the
    // parent page-history action (Scan Next Page) rearms it.
    automaticArmed.current = false;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) { done.current = false; onError('Could not capture a photo. Please try again.'); return; }
      stop();
      announce?.('Page captured.',
        { speak: true, vibrate: [45, 35, 45] });
      onCapture(blob);
    }, 'image/jpeg', 0.92);
  }, [announce, onCapture, onError, stop]);

  const changeMode = (nextMode) => {
    setMode(nextMode);
    stableSince.current = null; previousSignature.current = null; setCountdown('');
    candidate.current = { key: '', count: 0 }; announcedKey.current = '';
    const text = nextMode === 'manual'
      ? 'Manual capture selected. Capture when ready.'
      : 'Automatic capture selected. Hold a clear page steady for four seconds.';
    setGuidance(text);
    announce?.(text, { speak: false });
  };

  // Judge the live view and coach the user. Manual mode analyzes but never captures.
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(async () => {
      const video = videoRef.current;
      if (!video?.videoWidth || done.current) return;
      let result;
      try { result = analyze(video); } catch { return; }
      const movement = result.motion === true
        || (result.frameSignature && previousSignature.current
          && frameMotionScore(previousSignature.current, result.frameSignature) > MOTION_THRESHOLD);
      if (result.frameSignature) previousSignature.current = result.frameSignature;
      const automaticReady = mode === 'automatic' && automaticArmed.current
        && result.ok && result.pageDetected === true && !movement;
      if (automaticReady) {
        const now = Date.now();
        if (stableSince.current === null) stableSince.current = now;
        const elapsed = now - stableSince.current;
        const remaining = Math.max(1, Math.ceil((stableDurationMs - elapsed) / 1000));
        setCountdown(`Automatic capture in ${remaining} second${remaining === 1 ? '' : 's'}.`);
        say('ready', 'Hold steady.', { vibrate: 30 });
        if (elapsed >= stableDurationMs) capture();
      } else {
        stableSince.current = null; setCountdown('');
        const guidance = {
          dark: 'More light.',
          lowContrast: 'Move closer.',
          blurry: 'Hold steady.',
          pageClipped: 'Move farther.',
          pageSmall: 'Move closer.',
          pageLeft: 'Move left.',
          pageRight: 'Move right.',
          pageHigh: 'Move up.',
          pageLow: 'Move down.',
        };
        if (movement) say('moving', 'Hold steady.');
        else if (mode === 'automatic' && result.ok && result.pageDetected !== true) say('findPage', 'Center the full page.');
        else if (!result.ok) say(result.issue || 'adjust', guidance[result.issue] || result.message);
        else say('readyManual', 'Ready to capture.');
        if (result.issue === 'dark' && torchSupported && !torchOn && !triedTorch.current) {
          triedTorch.current = true;
          if (await setTorch(true)) say('torch', 'More light. Flash on.', { force: true });
        }
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, analyze, intervalMs, mode, stableDurationMs, capture, say, torchSupported, torchOn]);

  return <div className="webcam">
    <fieldset className="capture-mode">
      <legend>Capture mode</legend>
      <label><input type="radio" name="capture-mode" value="manual" checked={mode === 'manual'} onChange={() => changeMode('manual')} /> Manual</label>
      <label><input type="radio" name="capture-mode" value="automatic" checked={mode === 'automatic'} onChange={() => changeMode('automatic')} /> Automatic</label>
    </fieldset>
    <p className="support-note">{mode === 'manual' ? 'Manual mode: capture only when you press the button.' : 'Automatic mode: hold a clearly framed page steady for about four seconds.'}</p>
    {active && <video ref={videoRef} className="webcam-video" playsInline muted aria-label="Camera preview" />}
    <p className="guidance" role="status" aria-live={announce ? 'off' : 'polite'}>{guidance}</p>
    <p className="countdown-status" role="status" aria-live="polite">{countdown}</p>
    <div className="recording-controls">
      {!active
        ? <button ref={useCameraRef} type="button" className="secondary-button" onClick={start} disabled={disabled}>Use camera</button>
        : <>
          <button ref={captureButtonRef} type="button" className="primary-button" onClick={capture}>Capture Page</button>
          {torchSupported && <button type="button" className="secondary-button" aria-pressed={torchOn} onClick={() => setTorch(!torchOn)}>{torchOn ? 'Turn light off' : 'Turn light on'}</button>}
          <button type="button" className="secondary-button" onClick={() => stop(true)}>Cancel camera</button>
        </>}
    </div>
  </div>;
}
