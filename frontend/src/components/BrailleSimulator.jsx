import React, { useState } from 'react'
import BrailleCell from './BrailleCell.jsx'
import { formatSerialCommand } from './brailleSerial.js'
import './BrailleSimulator.css'

/**
 * Self-contained Braille simulator.
 * Props (all optional, for integration with the speech UI):
 *  - apiBase: backend base URL (default '' -> Vite proxy)
 *  - source: contract source value (default 'text')
 *  - initialText: starting text
 *  - externalText: when this changes, it is put in the box and translated
 *  - onPageChange(page, index, total): fired when the visible page changes
 */
export default function BrailleSimulator({
  apiBase = '', source = 'text', initialText = '', externalText, onPageChange,
}) {
  const [text, setText] = useState(initialText)
  const [grade, setGrade] = useState(1)
  const [result, setResult] = useState(null)
  const [index, setIndex] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const pages = result?.pages ?? []
  const page = pages[index] ?? [0, 0, 0]

  const notify = (i, p = pages) => onPageChange?.(p[i] ?? [0, 0, 0], i, p.length)

  async function translate(t = text) {
    setLoading(true); setError('')
    try {
      const res = await fetch(`${apiBase}/api/braille/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, text: t, mode: 'verbatim', grade }),
      })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data = await res.json()
      setResult(data); setIndex(0) // new text resets navigation
      onPageChange?.(data.pages[0] ?? [0, 0, 0], 0, data.pages.length)
    } catch (e) {
      setError(`Could not translate: ${e.message}. Is the backend running on port 8000?`)
    } finally { setLoading(false) }
  }

  const prevExternal = React.useRef(externalText)
  React.useEffect(() => {
    if (externalText !== undefined && externalText !== prevExternal.current) {
      prevExternal.current = externalText
      setText(externalText); translate(externalText)
    }
  })

  const go = (d) => {
    const i = Math.min(Math.max(index + d, 0), pages.length - 1)
    setIndex(i); notify(i)
  }

  let serial = ''
  try { serial = result ? formatSerialCommand(page) : '' } catch { /* ignore */ }

  return (
    <div className="bb-sim">
      <h2>BrailleBridge Simulator</h2>
      <textarea value={text} rows={4} placeholder="Type text to translate…"
        onChange={(e) => setText(e.target.value)} />
      <div className="bb-row">
        <div className="bb-switch" role="group" aria-label="Braille grade">
          {[1, 2].map((g) => (
            <button key={g} className={grade === g ? 'active' : ''} onClick={() => setGrade(g)}>
              Grade {g}
            </button>
          ))}
        </div>
        <button className="bb-primary" onClick={() => translate()} disabled={loading}>
          {loading ? 'Translating…' : 'Translate'}
        </button>
      </div>
      {error && <p className="bb-error" role="alert">{error}</p>}

      <div className="bb-cells">
        {page.map((m, i) => <BrailleCell key={i} mask={m} />)}
      </div>
      <div className="bb-row bb-nav">
        <button onClick={() => go(-1)} disabled={index <= 0}>← Previous</button>
        <span>Page {pages.length ? index + 1 : 0} / {pages.length}</span>
        <button onClick={() => go(1)} disabled={index >= pages.length - 1}>Next →</button>
      </div>

      <h3>Full Braille</h3>
      <p className="bb-preview">{result?.braille_unicode || '—'}</p>
      <h3>Serial command (preview only)</h3>
      <pre>{serial ? JSON.stringify(serial) : '—'}</pre>
      <h3>Debug JSON</h3>
      <pre>{result ? JSON.stringify(result, null, 2) : '—'}</pre>
    </div>
  )
}
