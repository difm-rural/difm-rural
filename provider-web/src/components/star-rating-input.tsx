'use client'

import { useState } from 'react'

export function StarRatingInput({ initial, rating, onRating }: { initial?: number | null; rating?: number; onRating?: (value:number) => void }) {
  const [localRating, setLocalRating] = useState(initial ?? 0)
  const selected = rating ?? localRating
  return (
    <fieldset className="star-input">
      <legend className="sr-only">Rating *</legend>
      <div className="star-input-row">
        {[1, 2, 3, 4, 5].map(n => (
          <label key={n}>
            <input
              type="radio"
              aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
              name="rating"
              value={n}
              required={n === 1}
              checked={selected === n}
              onChange={() => { setLocalRating(n); onRating?.(n) }}
            />
            <span aria-hidden="true">★</span>
          </label>
        ))}
      </div>
      <p className="muted star-input-value" role="status">{selected ? `${selected} of 5 stars` : 'No rating selected'}</p>
    </fieldset>
  )
}
