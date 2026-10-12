// Reusable listing card — a CSS reproduction of the RN JobServiceCard browse card
// (src/components/JobServiceCard.js). Literal rgba/positions are copied from RN for
// fidelity; the surrounding chrome uses provider-web's own tokens. Pure/presentational
// (no hooks), so both the client form (C2 chooser) and the server listings page (C3)
// can render it.
import { ImageIcon } from 'lucide-react'

export type CardStyle = 'bold' | 'bottom' | 'clean' | null | undefined

// RN renders the base (bottom) treatment whenever the style isn't bold/clean, so
// null/'bottom' collapse to the same modifier here.
function styleMod(cardStyle: CardStyle): '' | 'bold' | 'clean' {
  return cardStyle === 'bold' ? 'bold' : cardStyle === 'clean' ? 'clean' : ''
}

// The photo + card-message overlay — the part that changes by card_style. The overlay
// shows ONLY when there's a photo AND a headline (matches RN), headline only, 3-line clamp.
export function CardImage({
  photoUrl,
  category,
  headline,
  cardStyle,
}: {
  photoUrl?: string | null
  category?: string | null
  headline?: string | null
  cardStyle?: CardStyle
}) {
  const mod = styleMod(cardStyle)
  const head = (headline ?? '').trim()
  return (
    <div className="lcard-img">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={head || category || 'Listing photo'} />
      ) : (
        <div className="lcard-placeholder">
          <ImageIcon size={22} />
          <span>{category || 'Listing'}</span>
        </div>
      )}
      {photoUrl && head && (
        <div className={`lcard-msg${mod ? ' ' + mod : ''}`}>
          <span className={`lcard-msg-text${mod === 'clean' ? ' clean' : ''}`}>{head}</span>
        </div>
      )}
    </div>
  )
}

export type ListingCardData = {
  title?: string | null
  photoUrl?: string | null
  category?: string | null
  cardHeadline?: string | null
  cardStyle?: CardStyle
  priceLabel?: string | null
  kindLabel?: string | null
  badge?: { label: string; tone: 'live' | 'paused' | 'closed' } | null
}

export function ListingCard({ data }: { data: ListingCardData }) {
  return (
    <div className="lcard">
      <CardImage
        photoUrl={data.photoUrl}
        category={data.category}
        headline={data.cardHeadline}
        cardStyle={data.cardStyle}
      />
      <div className="lcard-body">
        <div className="lcard-title">{data.title || 'Untitled listing'}</div>
        <div className="lcard-meta">
          {data.priceLabel && <span className="lcard-price">{data.priceLabel}</span>}
          {data.kindLabel && <span className="kind-tag">{data.kindLabel}</span>}
        </div>
        {data.badge && (
          <span className={`badge ${data.badge.tone}`}>{data.badge.label}</span>
        )}
      </div>
    </div>
  )
}
