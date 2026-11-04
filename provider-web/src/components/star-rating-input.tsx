import { Fragment } from 'react'

// A no-JS 5-star picker that works inside the server-rendered ActionForm.
// Radios are rendered high-to-low (5→1) and laid out row-reverse so the
// `~` sibling selector can fill stars left-to-right on hover/check — the
// same visual language as the mobile ReviewModal's StarRating.
export function StarRatingInput({ initial }: { initial?: number | null }) {
  return (
    <fieldset className="star-input">
      <legend className="sr-only">Rating *</legend>
      <div className="star-input-row">
        {[5, 4, 3, 2, 1].map((n, i) => (
          <Fragment key={n}>
            <input
              type="radio"
              id={`rating-${n}`}
              name="rating"
              value={n}
              required={i === 0}
              defaultChecked={initial === n}
            />
            <label htmlFor={`rating-${n}`} aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}>★</label>
          </Fragment>
        ))}
      </div>
    </fieldset>
  )
}
