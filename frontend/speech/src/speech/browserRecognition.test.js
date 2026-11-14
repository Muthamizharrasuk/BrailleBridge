import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserRecognition, getSpeechSupport } from './browserRecognition.js';
import { FakeRecognition } from '../test/fakeRecognition.js';

describe('browser recognition adapter', () => {
  let adapter;
  const latest = () => FakeRecognition.instances.at(-1);
  beforeEach(() => {
    FakeRecognition.instances = [];
    adapter = createBrowserRecognition({ environment: { SpeechRecognition: FakeRecognition } });
  });

  it('detects unsupported browsers, insecure origins, and the prefixed API', () => {
    expect(getSpeechSupport({}).supported).toBe(false);
    expect(getSpeechSupport({ SpeechRecognition: FakeRecognition, isSecureContext: false }).supported).toBe(false);
    expect(getSpeechSupport({ webkitSpeechRecognition: FakeRecognition }).supported).toBe(true);
    const unsupported = createBrowserRecognition({ environment: {} });
    unsupported.start();
    expect(unsupported.getSnapshot().status).toBe('idle');
  });

  it('starts, ignores duplicate starts, and stops while accepting a final result', () => {
    adapter.start();
    const recognition = latest();
    expect(adapter.getSnapshot().status).toBe('requesting');
    expect(recognition.lang).toBe('en-US');
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
    adapter.start();
    expect(FakeRecognition.instances).toHaveLength(1);
    recognition.emit('start');
    expect(adapter.getSnapshot().status).toBe('listening');
    adapter.stop();
    adapter.stop();
    expect(recognition.stop).toHaveBeenCalledTimes(1);
    expect(adapter.getSnapshot().status).toBe('stopping');
    recognition.results(['Hello', true]);
    recognition.emit('end');
    expect(adapter.getSnapshot()).toMatchObject({ status: 'idle', transcript: 'Hello', error: '' });
  });

  it('replaces interim results and does not duplicate final phrases', () => {
    adapter.start();
    latest().emit('start');
    latest().results(['hel', false]);
    expect(adapter.getSnapshot()).toMatchObject({ transcript: '', interim: 'hel' });
    latest().results(['Hello', true], [' wor', false]);
    latest().results(['Hello', true], [' world!', true]);
    expect(adapter.getSnapshot()).toMatchObject({ transcript: 'Hello world!', interim: '' });
  });

  it('preserves names, numbers, negation, punctuation, and manual edits between sessions', () => {
    adapter.setTranscript('Do NOT call Ana at 8:30.');
    adapter.start();
    latest().emit('start');
    latest().results(['Meet at 42 Main St.', true]);
    latest().emit('end');
    expect(adapter.getSnapshot().transcript).toBe('Do NOT call Ana at 8:30. Meet at 42 Main St.');
    adapter.setTranscript('Corrected: 9:30.');
    adapter.start();
    latest().results([' Yes.', true]);
    latest().emit('end');
    expect(adapter.getSnapshot().transcript).toBe('Corrected: 9:30. Yes.');
  });

  it('does not accept transcript edits while listening', () => {
    adapter.start();
    adapter.setTranscript('Should not replace the capture');
    expect(adapter.getSnapshot().transcript).toBe('');
  });

  it('handles empty audio without deleting an existing transcript', () => {
    adapter.setTranscript('Keep this');
    adapter.start();
    latest().emit('start');
    latest().results(['', true]);
    latest().emit('end');
    expect(adapter.getSnapshot()).toMatchObject({ transcript: 'Keep this', interim: '', status: 'idle' });
    expect(adapter.getSnapshot().error).toContain('No speech');
  });

  it.each([
    ['not-allowed', 'denied'], ['service-not-allowed', 'blocked'],
    ['audio-capture', 'microphone'], ['network', 'connect'], ['no-speech', 'No speech'],
    ['language-not-supported', 'unavailable'], ['unknown', 'unexpectedly'],
  ])('handles %s errors and allows a retry', (code, message) => {
    adapter.start();
    const previous = latest();
    previous.emit('error', { error: code });
    expect(adapter.getSnapshot().status).toBe('idle');
    expect(adapter.getSnapshot().error).toContain(message);
    expect(previous.abort).toHaveBeenCalledOnce();
    adapter.start();
    expect(adapter.getSnapshot()).toMatchObject({ status: 'requesting', error: '' });
  });

  it('handles a synchronous permission rejection', () => {
    class Denied extends FakeRecognition {
      start = () => { throw new DOMException('Denied', 'NotAllowedError'); };
    }
    const denied = createBrowserRecognition({ environment: { SpeechRecognition: Denied } });
    denied.start();
    expect(denied.getSnapshot().error).toContain('denied');
    expect(denied.getSnapshot().status).toBe('idle');
  });

  it('cancels a pending permission request without reporting empty audio', () => {
    adapter.start();
    const recognition = latest();
    adapter.stop();
    expect(recognition.abort).toHaveBeenCalledOnce();
    expect(adapter.getSnapshot()).toMatchObject({ status: 'idle', error: '' });
    recognition.emit('start');
    expect(adapter.getSnapshot().status).toBe('idle');
  });

  it('cleans up the microphone and ignores delayed callbacks on unmount', () => {
    const changed = vi.fn();
    const controller = createBrowserRecognition({ environment: { SpeechRecognition: FakeRecognition }, onChange: changed });
    controller.start();
    const recognition = latest();
    const delayedStart = recognition.onstart;
    controller.dispose();
    changed.mockClear();
    delayedStart();
    recognition.results(['Late words', true]);
    expect(recognition.abort).toHaveBeenCalledOnce();
    expect(changed).not.toHaveBeenCalled();
  });
});
