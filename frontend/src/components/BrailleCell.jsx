import React from 'react'

// Dot layout: 1 4 / 2 5 / 3 6. Dot n is raised when mask & (1 << (n-1)).
const ORDER = [1, 4, 2, 5, 3, 6]

export default function BrailleCell({ mask = 0 }) {
  return (
    <div className="bb-cell" aria-label={`Braille cell mask ${mask}`}>
      {ORDER.map((d) => {
        const on = (mask & (1 << (d - 1))) !== 0
        return <span key={d} className={`bb-dot${on ? ' on' : ''}`} title={`dot ${d}`} />
      })}
      <span className="bb-mask">{mask}</span>
    </div>
  )
}
