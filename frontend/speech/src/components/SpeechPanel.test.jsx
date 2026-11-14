import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SpeechPanel from './SpeechPanel.jsx';
import { FakeRecognition } from '../test/fakeRecognition.js';

describe('SpeechPanel', () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
  });

  it('allows typing, editing, counting, and clearing an empty transcript', async () => {
    const user = userEvent.setup();
    render(<SpeechPanel />);
    const transcript = screen.getByRole('textbox', { name: 'Your transcript' });
    expect(transcript).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Clear transcript' })).toBeDisabled();
    await user.type(transcript, 'Hello Ana!');
    expect(transcript).toHaveValue('Hello Ana!');
    expect(screen.getByText('10 characters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear transcript' }));
    expect(transcript).toHaveValue('');
  });

  it('renders listening and finishing states, then allows correction', async () => {
    const user = userEvent.setup();
    render(<React.StrictMode><SpeechPanel /></React.StrictMode>);
    await user.click(screen.getByRole('button', { name: 'Start Listening' }));
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for microphone');
    const recognition = FakeRecognition.instances.at(-1);
    act(() => recognition.emit('start'));
    expect(screen.getByRole('status')).toHaveTextContent('Listening...');
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
    act(() => recognition.results(['hello', false]));
    expect(screen.getByText('hello')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop Listening' }));
    expect(screen.getByRole('status')).toHaveTextContent('Finishing');
    act(() => { recognition.results(['Hello Ana.', true]); recognition.emit('end'); });
    expect(screen.getByRole('textbox')).toHaveValue('Hello Ana.');
    expect(screen.getByRole('textbox')).not.toHaveAttribute('readonly');
    await user.type(screen.getByRole('textbox'), ' Meet at 9.');
    expect(screen.getByRole('textbox')).toHaveValue('Hello Ana. Meet at 9.');
  });

  it('shows microphone permission errors without blocking typing', async () => {
    const user = userEvent.setup();
    render(<SpeechPanel />);
    await user.click(screen.getByRole('button', { name: 'Start Listening' }));
    act(() => FakeRecognition.instances.at(-1).emit('error', { error: 'not-allowed' }));
    expect(screen.getByRole('alert')).toHaveTextContent('denied');
    await user.type(screen.getByRole('textbox'), 'Typed fallback');
    expect(screen.getByRole('textbox')).toHaveValue('Typed fallback');
    expect(screen.getByRole('button', { name: 'Start Listening' })).toBeEnabled();
  });

  it('explains unsupported browsers while leaving typing available', async () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    const user = userEvent.setup();
    render(<SpeechPanel />);
    expect(screen.getByText(/Speech recognition is unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Listening' })).toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'Still works');
    expect(screen.getByRole('textbox')).toHaveValue('Still works');
  });
});
