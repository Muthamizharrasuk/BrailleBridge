import { vi } from 'vitest';

export class FakeRecognition {
  static instances = [];
  constructor() { FakeRecognition.instances.push(this); }
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  emit(name, value = {}) { this[`on${name}`]?.(value); }
  results(...phrases) {
    this.emit('result', { results: phrases.map(([text, final]) => Object.assign([{ transcript: text }], { isFinal: final })) });
  }
}
