import React, { useEffect, useRef, useState } from 'react';
import TranslationPanel from '../components/TranslationPanel.jsx';
import { translateWithLocalAI } from '../ai/client.js';

export default function TextFeature({ grade }) {
  const [text, setText] = useState('');
  const [translated, setTranslated] = useState('');
  const [hasTranslation, setHasTranslation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);

  useEffect(() => () => request.current?.abort(), []);

  async function translateFrench() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;

    setLoading(true);
    setError('');
    setHasTranslation(false);

    try {
      const english = await translateWithLocalAI(text, {
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      setTranslated(english);
      setHasTranslation(true);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err.message);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }

  function changeOriginal(value) {
    request.current?.abort();
    setText(value);
    setTranslated('');
    setHasTranslation(false);
    setLoading(false);
    setError('');
  }

  return (
    <section className="feature-workspace" aria-labelledby="text-heading">
      <p className="eyebrow">TEXT TO BRAILLE</p>
      <h1 id="text-heading">Turn written words into Braille.</h1>
      <p className="intro">
        Type or paste text, translate French into English locally,
        and review the Braille output.
      </p>

      <div className="workspace-card">
        <div className="transcript-heading">
          <label className="section-label" htmlFor="text-input">
            Your text
          </label>
          <button
            type="button"
            className="text-button"
            disabled={!text}
            onClick={() => changeOriginal('')}
          >
            Clear
          </button>
        </div>

        <textarea
          id="text-input"
          className="transcript-input"
          rows="7"
          value={text}
          onChange={(event) => changeOriginal(event.target.value)}
          placeholder="Type English or French text..."
          aria-describedby="text-help text-count"
        />

        <div className="transcript-meta">
          <span id="text-help">
            English text can be converted directly to Braille.
          </span>
          <span id="text-count">{text.length} characters</span>
        </div>

        <TranslationPanel text={text} source="text" grade={grade} />

        <section
          className="local-ai-panel"
          aria-labelledby="local-ai-heading"
        >
          <div className="local-ai-heading">
            <div>
              <p className="eyebrow">ON-DEVICE TRANSLATION</p>
              <h2 id="local-ai-heading">
                Translate French to English
              </h2>
            </div>
          </div>

          <p>
            Uses SMaLL-100 on the Arduino UNO Q.
            Your original text is preserved.
          </p>

          <div className="hardware-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={translateFrench}
              disabled={!text.trim() || loading}
            >
              {loading
                ? 'Translating on UNO Q...'
                : 'Translate French → English'}
            </button>
          </div>

          {loading && (
            <p className="inline-status" role="status">
              SMaLL-100 is translating locally...
            </p>
          )}

          {error && (
            <p className="error-message" role="alert">
              {error} Your original text is unchanged.
            </p>
          )}

          {hasTranslation && (
            <div className="simplified-draft">
              <label
                className="section-label"
                htmlFor="translated-text"
              >
                English translation
              </label>

              <textarea
                id="translated-text"
                className="transcript-input"
                rows="6"
                value={translated}
                onChange={(event) =>
                  setTranslated(event.target.value)
                }
              />

              <div className="transcript-meta">
                <span>Review or edit the English translation.</span>
                <span>{translated.length} characters</span>
              </div>

              <TranslationPanel
                text={translated}
                source="text"
                sourceLabel="UNO Q English translation"
                grade={grade}
                label="Convert English translation to Braille"
              />
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
