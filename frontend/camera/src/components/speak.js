// Announce guidance aloud (many blind users do not have a screen reader running on every
// device) in addition to the aria-live text region.
export function speak(message, { interrupt = true, onStart, onEnd, onBoundary } = {}) {
  try {
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof globalThis.SpeechSynthesisUtterance !== 'function') return null;
    if (interrupt) synth.cancel();
    if (!message) return null; // empty message just stops speech
    const utterance = new globalThis.SpeechSynthesisUtterance(message);
    if (onStart) utterance.onstart = onStart;
    if (onEnd) utterance.onend = onEnd;
    if (onBoundary) utterance.onboundary = onBoundary;
    synth.speak(utterance);
    return utterance;
  } catch { /* speech is a best-effort extra */ }
  return null;
}

export function pauseSpeech() {
  try { globalThis.speechSynthesis?.pause?.(); } catch { /* best effort */ }
}

export function resumeSpeech() {
  try { globalThis.speechSynthesis?.resume?.(); } catch { /* best effort */ }
}

export function stopSpeech() {
  try { globalThis.speechSynthesis?.cancel?.(); } catch { /* best effort */ }
}
