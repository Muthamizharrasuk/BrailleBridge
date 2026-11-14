import { useCallback, useEffect, useRef, useState } from 'react';
import { pauseSpeech, resumeSpeech, speak, stopSpeech } from '../components/speak.js';

export default function useReadAloud({ announce }) {
  const [state, setState] = useState({ status: 'idle', pageId: null });
  const positions = useRef(new Map());
  const active = useRef({ pageId: null, offset: 0 });
  const session = useRef(0);

  const stop = useCallback(({ announceStatus = true } = {}) => {
    session.current += 1;
    active.current = { pageId: null, offset: 0 };
    stopSpeech();
    setState({ status: 'idle', pageId: null });
    if (announceStatus) announce('Reading stopped.', { vibrate: 30 });
  }, [announce]);

  const play = useCallback((text, pageId) => {
    const token = ++session.current;
    if (!text.trim()) return;
    stopSpeech();
    const offset = positions.current.get(pageId) ?? 0;
    const effectiveOffset = text.slice(offset) ? offset : 0;
    active.current = { pageId, offset: effectiveOffset };
    const remaining = text.slice(effectiveOffset);
    if (!effectiveOffset) positions.current.set(pageId, 0);
    setState({ status: 'playing', pageId });
    announce(pageId === 'draft' ? 'Reading typed text.' : `Reading scanned page ${pageId}.`, { vibrate: 25 });
    speak(remaining, {
      onBoundary: (event) => {
        if (token === session.current && typeof event.charIndex === 'number') positions.current.set(pageId, effectiveOffset + event.charIndex);
      },
      onEnd: () => {
        if (token !== session.current) return;
        positions.current.set(pageId, 0);
        active.current = { pageId: null, offset: 0 };
        setState({ status: 'idle', pageId: null });
        announce(pageId === 'draft' ? 'Finished reading typed text.' : `Finished reading scanned page ${pageId}.`, { vibrate: [30, 40, 30] });
      },
    });
  }, [announce]);

  const pause = useCallback(() => {
    pauseSpeech();
    setState((current) => ({ ...current, status: 'paused' }));
    announce('Reading paused.', { vibrate: 30 });
  }, [announce]);

  const resume = useCallback(() => {
    resumeSpeech();
    setState((current) => ({ ...current, status: 'playing' }));
    announce('Reading resumed.', { vibrate: 25 });
  }, [announce]);

  useEffect(() => () => stopSpeech(), []);
  return { ...state, play, pause, resume, stop, positions };
}
