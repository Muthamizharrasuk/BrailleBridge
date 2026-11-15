import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebcamCapture, { AUTO_STABLE_MS, GUIDANCE_STABLE_SAMPLES } from './WebcamCapture.jsx';

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
  it('defaults to manual mode and never auto-captures a stable page', async () => {
    const stream = fakeStream();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    const onCapture = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WebcamCapture onCapture={onCapture} onError={vi.fn()} intervalMs={100}
      analyze={() => ({ ok: true, pageDetected: true })} />);
    expect(screen.getByRole('radio', { name: /manual/i })).toBeChecked();
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    await tick(AUTO_STABLE_MS + 1000);
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('requires four continuous seconds of a detected, stable page in automatic mode', async () => {
    const stream = fakeStream();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    const onCapture = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WebcamCapture onCapture={onCapture} onError={vi.fn()} analyze={() => ({ ok: true, pageDetected: true })}
      intervalMs={100} initialMode="automatic" />);
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    await tick(AUTO_STABLE_MS - 100);
    expect(onCapture).not.toHaveBeenCalled();
    await tick(250);
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(stream.track.stop).toHaveBeenCalled();
  });

  it('resets automatic countdown after movement or poor quality', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) } });
    let result = { ok: true, pageDetected: true };
    const onCapture = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WebcamCapture onCapture={onCapture} onError={vi.fn()} analyze={() => result}
      intervalMs={100} initialMode="automatic" />);
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    await tick(2500);
    result = { ok: true, pageDetected: true, motion: true };
    await tick(150);
    result = { ok: false, issue: 'dark' };
    await tick(150);
    result = { ok: true, pageDetected: true };
    await tick(3000);
    expect(onCapture).not.toHaveBeenCalled();
    await tick(1200);
    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it('switches modes without restarting the active camera', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream());
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const onCapture = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WebcamCapture onCapture={onCapture} onError={vi.fn()} analyze={() => ({ ok: true, pageDetected: true })}
      intervalMs={100} />);
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    await user.click(screen.getByRole('radio', { name: /automatic/i }));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Automatic capture selected/i)).toBeInTheDocument();
    await tick(AUTO_STABLE_MS + 200);
    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it('does not repeat an automatic capture until Scan Next Page signals rearming', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) } });
    const onCapture = vi.fn();
    const { rerender } = render(<WebcamCapture onCapture={onCapture} onError={vi.fn()}
      analyze={() => ({ ok: true, pageDetected: true })} intervalMs={100} initialMode="automatic" startSignal={0} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    await tick(AUTO_STABLE_MS + 200);
    expect(onCapture).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    await tick(AUTO_STABLE_MS + 300);
    expect(onCapture).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /cancel camera/i }));
    rerender(<WebcamCapture onCapture={onCapture} onError={vi.fn()}
      analyze={() => ({ ok: true, pageDetected: true })} intervalMs={100} initialMode="automatic" startSignal={1} />);
    await tick(10);
    await tick(AUTO_STABLE_MS + 300);
    expect(onCapture).toHaveBeenCalledTimes(2);
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
      'Camera ready. Capture when ready.', 'More light.', 'Move closer.',
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
    render(<WebcamCapture onCapture={onCapture} onError={vi.fn()}
      analyze={() => ({ ok: false, message: 'x' })} />);
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    await user.click(screen.getByRole('button', { name: /capture page/i }));
    expect(onCapture).toHaveBeenCalledTimes(1);
  });
});
