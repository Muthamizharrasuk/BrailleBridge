// Announce guidance aloud (many blind users do not have a screen reader running on every
// device) in addition to the aria-live text region.
export function speak(message) {
  try {
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof globalThis.SpeechSynthesisUtterance !== 'function') return;
    synth.cancel();
    if (!message) return; // empty message just stops speech
    synth.speak(new globalThis.SpeechSynthesisUtterance(message));
  } catch { /* speech is a best-effort extra */ }
}
