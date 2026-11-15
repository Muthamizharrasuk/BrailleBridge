import React from 'react'

// Dot layout: 1 4 / 2 5 / 3 6. Dot n is raised when mask & (1 << (n-1)).
const ORDER = [1, 4, 2, 5, 3, 6]

export default function BrailleCell({ mask = 0, padded = false }) {
  return (
    <div className="bb-cell" role="img" aria-label={padded ? 'Padding cell' : `Braille cell mask ${mask}`}>
      {ORDER.map((d) => {
        const on = (mask & (1 << (d - 1))) !== 0
        return <span key={d} className={`bb-dot${on ? ' on' : ''}`} title={`dot ${d}`} />
      })}
      <span className="bb-mask">{padded ? 'Padding' : `Mask ${mask}`}</span>
    </div>
  )
}
