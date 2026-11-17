export function StarRatingInput({ initial, rating, onRating }: { initial?: number | null; rating?: number; onRating?: (value:number) => void }) {
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
              {...(onRating ? {checked:rating===n,onChange:()=>onRating(n)} : {defaultChecked:initial===n})}
            />
            <span aria-hidden="true">★</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
