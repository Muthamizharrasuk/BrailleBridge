import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebcamCapture, { GUIDANCE_STABLE_SAMPLES, STEADY_SAMPLES } from './WebcamCapture.jsx';

function fakeStream({ torch = false } = {}) {
  const track = { stop: vi.fn(), getCapabilities: () => ({ torch }), applyConstraints: vi.fn().mockResolvedValue() };
  return { getTracks: () => [track], getVideoTracks: () => [track], track };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
  HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }));
  HTMLCanvasElement.prototype.toBlob = vi.fn((cb) => cb(new Blob(['x'], { type: 'image/jpeg' })));
});
afterEach(() => vi.useRealTimers());

const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('WebcamCapture guidance', () => {
  it('coaches the user, then captures automatically once the view is steady', async () => {
    const stream = fakeStream();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    const analyze = vi.fn()
      .mockReturnValueOnce({ ok: false, issue: 'blurry', message: 'The image is blurry.' })
      .mockReturnValueOnce({ ok: false, issue: 'blurry', message: 'The image is blurry.' })
      .mockReturnValue({ ok: true, issue: null, message: 'Looks good. Hold still.' });
    const onCapture = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WebcamCapture onCapture={onCapture} onError={vi.fn()} analyze={analyze} intervalMs={100} />);
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    await tick(100 * GUIDANCE_STABLE_SAMPLES);
    expect(screen.getByRole('status')).toHaveTextContent('Hold steady');
    expect(onCapture).not.toHaveBeenCalled();
    await tick(100 * STEADY_SAMPLES + 50);
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(stream.track.stop).toHaveBeenCalled();
  });

  it('replaces guidance quickly after a genuinely changed state without repeating samples', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) } });
    const announce = vi.fn();
    const analyze = vi.fn()
      .mockReturnValueOnce({ ok: false, issue: 'dark' })
      .mockReturnValueOnce({ ok: false, issue: 'dark' })
      .mockReturnValueOnce({ ok: false, issue: 'pageSmall' })
      .mockReturnValue({ ok: false, issue: 'pageSmall' });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WebcamCapture onCapture={vi.fn()} onError={vi.fn()} announce={announce} analyze={analyze} intervalMs={100} />);
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    await tick(450);
    expect(announce.mock.calls.map(([message]) => message)).toEqual([
      'Camera ready. Hold over the page.', 'More light.', 'Move closer.',
    ]);
    await tick(500);
    expect(announce).toHaveBeenCalledTimes(3);
  });

  it('does not capture while the image keeps failing', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) } });
    const onCapture = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WebcamCapture onCapture={onCapture} onError={vi.fn()} intervalMs={100}
      analyze={() => ({ ok: false, issue: 'dark', message: 'Too dark.' })} />);
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    await tick(1500);
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('turns on the flashlight automatically when it is too dark', async () => {
    const stream = fakeStream({ torch: true });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WebcamCapture onCapture={vi.fn()} onError={vi.fn()} intervalMs={100}
      analyze={() => ({ ok: false, issue: 'dark', message: 'Too dark.' })} />);
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    await tick(200);
    expect(stream.track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
    expect(screen.getByRole('button', { name: /turn light off/i })).toBeInTheDocument();
  });

  it('hides the light button when the device has no flashlight', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WebcamCapture onCapture={vi.fn()} onError={vi.fn()} analyze={() => ({ ok: false, message: 'x' })} />);
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    expect(screen.queryByRole('button', { name: /turn light/i })).not.toBeInTheDocument();
  });

  it('manual capture still works', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) } });
    const onCapture = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WebcamCapture onCapture={onCapture} onError={vi.fn()} autoCapture={false}
      analyze={() => ({ ok: false, message: 'x' })} />);
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    await user.click(screen.getByRole('button', { name: /take photo now/i }));
    expect(onCapture).toHaveBeenCalledTimes(1);
  });
});
