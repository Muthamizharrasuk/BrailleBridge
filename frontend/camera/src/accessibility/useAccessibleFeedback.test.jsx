import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useAccessibleFeedback from './useAccessibleFeedback.js';

beforeEach(() => globalThis.localStorage?.clear());

describe('accessible feedback', () => {
  it('keeps app speech opt-in while providing text and vibration', () => {
    const vibrate = vi.fn(); const spoken = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    vi.stubGlobal('speechSynthesis', { speak: spoken, cancel: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', function Utterance(text) { this.text = text; });
    const { result } = renderHook(() => useAccessibleFeedback());
    act(() => result.current.announce('Page ready.', { speak: true, vibrate: 40 }));
    expect(result.current.status).toBe('Page ready.');
    expect(vibrate).toHaveBeenCalledWith(40);
    expect(spoken).not.toHaveBeenCalled();
    act(() => result.current.setSpokenGuidance(true));
    act(() => result.current.announce('Camera ready.', { speak: true }));
    expect(spoken.mock.calls.at(-1)[0].text).toBe('Camera ready.');
  });

  it('deduplicates repeated status, speech, and haptics', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    const { result } = renderHook(() => useAccessibleFeedback());
    act(() => result.current.announce('Hold still.', { vibrate: 20 }));
    act(() => result.current.announce('Hold still.', { vibrate: 20 }));
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('replaces stale app guidance instead of stacking rapid status changes', () => {
    const cancel = vi.fn(); const spoken = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak: spoken, cancel, speaking: false, paused: false });
    vi.stubGlobal('SpeechSynthesisUtterance', function Utterance(text) { this.text = text; });
    const { result } = renderHook(() => useAccessibleFeedback());
    act(() => result.current.setSpokenGuidance(true));
    act(() => result.current.announce('More light.', { speak: true }));
    act(() => result.current.announce('Move closer.', { speak: true }));
    expect(spoken.mock.calls.map(([utterance]) => utterance.text)).toEqual(['More light.', 'Move closer.']);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('Move closer.');
  });

  it('supports an injected native haptics adapter while retaining text status', () => {
    const adapter = { supported: true, trigger: vi.fn() };
    const { result } = renderHook(() => useAccessibleFeedback({ hapticsAdapter: adapter }));
    act(() => result.current.announce('Page captured.', { vibrate: [40, 20, 40] }));
    expect(adapter.trigger).toHaveBeenCalledWith([40, 20, 40]);
    expect(result.current.status).toBe('Page captured.');
  });
});
