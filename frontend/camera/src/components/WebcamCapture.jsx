import React, { useCallback, useEffect, useRef, useState } from 'react';
import { assessQuality, measureCanvasLike } from '../ocr/imageQuality.js';
import { cameraSupported, describeCameraError } from './webcamErrors.js';
import { speak } from './speak.js';

export const STEADY_SAMPLES = 4; // consecutive good samples before auto-capture (~2 s)
const SPEAK_GAP_MS = 2500;

const defaultAnalyze = (video) => assessQuality(measureCanvasLike(video, video.videoWidth, video.videoHeight));

// Live camera with spoken/visible guidance, optional flashlight, and automatic capture,
// so a user who cannot see the preview still gets a usable photo.
export default function WebcamCapture({
  onCapture, onError, disabled, analyze = defaultAnalyze, intervalMs = 500, autoCapture = true,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [guidance, setGuidance] = useState('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const lastSpoken = useRef({ text: '', at: 0 });
  const good = useRef(0);
  const done = useRef(false);
  const triedTorch = useRef(false);

  const say = useCallback((text, force = false) => {
    setGuidance(text);
    const now = Date.now();
    if (force || (text !== lastSpoken.current.text && now - lastSpoken.current.at >= SPEAK_GAP_MS)) {
      lastSpoken.current = { text, at: now };
      speak(text);
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false); setTorchOn(false); setTorchSupported(false); setGuidance('');
  }, []);
  useEffect(() => stop, [stop]);

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
      good.current = 0; done.current = false; triedTorch.current = false;
      const track = stream.getVideoTracks?.()[0];
      setTorchSupported(Boolean(track?.getCapabilities?.().torch));
      setActive(true);
      onError('');
      say('Camera on. Hold the phone about a hand length above the page. I will tell you when it looks good and take the photo for you.', true);
    } catch (error) {
      onError(describeCameraError(error));
    }
  }

  useEffect(() => {
    if (active && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play?.().catch(() => {});
    }
  }, [active]);

  const capture = useCallback((automatic = false) => {
    const video = videoRef.current;
    if (done.current) return;
    if (!video?.videoWidth) { onError('The camera is not ready yet. Wait a moment and try again.'); return; }
    done.current = true;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) { done.current = false; onError('Could not capture a photo. Please try again.'); return; }
      stop();
      speak(automatic ? 'Photo taken.' : 'Photo taken. Reading the text.');
      onCapture(blob);
    }, 'image/jpeg', 0.92);
  }, [onCapture, onError, stop]);

  // Judge the live view and coach the user.
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(async () => {
      const video = videoRef.current;
      if (!video?.videoWidth || done.current) return;
      let result;
      try { result = analyze(video); } catch { return; }
      if (result.ok) {
        good.current += 1;
        say(result.message);
        if (autoCapture && good.current >= STEADY_SAMPLES) capture(true);
      } else {
        good.current = 0;
        say(result.message);
        if (result.issue === 'dark' && torchSupported && !torchOn && !triedTorch.current) {
          triedTorch.current = true;
          if (await setTorch(true)) say('It was dark, so I turned on the flashlight.', true);
        }
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, analyze, intervalMs, autoCapture, capture, say, torchSupported, torchOn]);

  return <div className="webcam">
    {active && <video ref={videoRef} className="webcam-video" playsInline muted aria-label="Camera preview" />}
    <p className="guidance" role="status" aria-live="polite">{guidance}</p>
    <div className="recording-controls">
      {!active
        ? <button type="button" className="secondary-button" onClick={start} disabled={disabled}>Use camera</button>
        : <>
          <button type="button" className="primary-button" onClick={() => capture(false)}>Take photo now</button>
          {torchSupported && <button type="button" className="secondary-button" aria-pressed={torchOn} onClick={() => setTorch(!torchOn)}>{torchOn ? 'Turn light off' : 'Turn light on'}</button>}
          <button type="button" className="secondary-button" onClick={stop}>Cancel camera</button>
        </>}
    </div>
  </div>;
}
