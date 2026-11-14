import { useCallback, useRef, useState } from 'react';
import { speak } from '../components/speak.js';

const preference = (key, fallback) => {
  try {
    const stored = globalThis.localStorage?.getItem(key);
    return stored == null ? fallback : stored === 'true';
  } catch { return fallback; }
};

// Adapter boundary: a future Expo/React Native client can inject an adapter backed by
// native haptics without changing announcement behavior. The web adapter deliberately
// uses only the standard API; iOS Safari currently exposes no vibration API.
export const webHaptics = {
  get supported() { return typeof globalThis.navigator?.vibrate === 'function'; },
  trigger(pattern) {
    try { return this.supported ? globalThis.navigator.vibrate(pattern) : false; }
    catch { return false; }
  },
};

export default function useAccessibleFeedback({ hapticsAdapter = webHaptics } = {}) {
  // App speech is opt-in because browsers cannot reliably detect VoiceOver or TalkBack.
  const [spokenGuidance, setSpokenGuidanceState] = useState(() => preference('camera-spoken-guidance', false));
  const [haptics, setHapticsState] = useState(() => preference('camera-haptics', true));
  const [status, setStatus] = useState('Ready to scan page 1.');
  const last = useRef({ text: '', at: 0 });
  const appUtterance = useRef(null);

  const savePreference = useCallback((key, setter, value) => {
    setter(value);
    try { globalThis.localStorage?.setItem(key, String(value)); } catch { /* private mode */ }
  }, []);

  const announce = useCallback((text, options = {}) => {
    const clean = String(text || '').trim();
    if (!clean) return false;
    const now = Date.now();
    const duplicate = clean === last.current.text && now - last.current.at < (options.dedupeMs ?? 2500);
    if (duplicate) return false;
    last.current = { text: clean, at: now };
    setStatus(clean);
    const synthBusy = Boolean(globalThis.speechSynthesis?.speaking || globalThis.speechSynthesis?.paused);
    if (options.speak && spokenGuidance && (appUtterance.current || !synthBusy)) {
      let utterance = null;
      utterance = speak(clean, {
        interrupt: true,
        onEnd: () => { if (appUtterance.current === utterance) appUtterance.current = null; },
      });
      appUtterance.current = utterance;
    }
    if (options.vibrate && haptics) hapticsAdapter.trigger(options.vibrate);
    return true;
  }, [haptics, hapticsAdapter, spokenGuidance]);

  return {
    status,
    spokenGuidance,
    haptics,
    hapticsSupported: hapticsAdapter.supported,
    setSpokenGuidance: (value) => savePreference('camera-spoken-guidance', setSpokenGuidanceState, value),
    setHaptics: (value) => savePreference('camera-haptics', setHapticsState, value),
    announce,
  };
}
