import Link from '@/components/navigation-link'
import {listingCardCopy} from '@shared/listingCardCopy'
import {JobPrimaryImage} from '@/components/job-primary-image'
import {ThumbImg} from '@/components/thumb-img'
// Reusable listing card — a CSS reproduction of the RN JobServiceCard browse card
// (src/components/JobServiceCard.js). Literal rgba/positions are copied from RN for
// fidelity; the surrounding chrome uses provider-web's own tokens. Pure/presentational
// (no hooks), so both the client form (C2 chooser) and the server listings page (C3)
// can render it.
import type { ReactNode } from 'react'
import { categoryArtwork } from '@shared/categoryArtwork'

export type CardStyle = 'bold' | 'bottom' | 'clean' | null | undefined

// RN renders the base (bottom) treatment whenever the style isn't bold/clean, so
// null/'bottom' collapse to the same modifier here.
function styleMod(cardStyle: CardStyle): '' | 'bold' | 'clean' {
  return cardStyle === 'bold' ? 'bold' : cardStyle === 'clean' ? 'clean' : ''
}

// The photo + card-message overlay — the part that changes by card_style. The overlay
// shows ONLY when there's a photo AND a headline (matches RN), with the optional
// supporting line beneath (as RN's editor preview + detail hero show it), each 3-line clamp.
export function CardImage({
  photoUrl,
  jobId,
  category,
  headline,
  supporting,
  cardStyle,
}: {
  jobId?: string
  photoUrl?: string | null
  category?: string | null
  headline?: string | null
  supporting?: string | null
  cardStyle?: CardStyle
}) {
  const mod = styleMod(cardStyle)
  const head = (headline ?? '').trim()
  const sub = (supporting ?? '').trim()
  return (
    <div className="lcard-img">
      {photoUrl ? (
        <ThumbImg src={photoUrl} alt={category ? category+' photo' : 'Listing photo'} />
      ) : jobId&&process.env.NEXT_PUBLIC_JOB_PRIMARY_MEDIA==='true' ? (
        <JobPrimaryImage key={jobId} jobId={jobId} fallback={categoryArtwork(category??null)}/>
      ) : (
        // No photo: the category's artwork (an icon on its tint), as in the app.
        // eslint-disable-next-line @next/next/no-img-element -- local category artwork.
        <img src={categoryArtwork(category ?? null)} alt="" loading="lazy" />
      )}
      {photoUrl && head && (
        <div className={`lcard-msg${mod ? ' ' + mod : ''}`}>
          <span className={`lcard-msg-text${mod === 'clean' ? ' clean' : ''}`}>{head}</span>
          {sub && (
            <span className={`lcard-msg-sub${mod === 'clean' ? ' clean' : ''}`}>{sub}</span>
          )}
        </div>
      )}
    </div>
  )
}

export type ListingCardData = {
  jobId?: string
  title?: string | null
  description?: string | null
  photoUrl?: string | null
  category?: string | null
  cardHeadline?: string | null
  cardSupporting?: string | null
  cardStyle?: CardStyle
  priceLabel?: string | null
  kindLabel?: string | null
  // Marketplace side — amber "Job" tag or blue "Listing" tag before the title,
  // with the category/kind beside it in muted text, and the price in the ink
  // colour. Omit on manage/chooser cards that shouldn't carry a side tag.
  side?: 'job' | 'listing'
  badge?: { label: string; tone: 'live' | 'paused' | 'closed' } | null
}

// `footer` lets a composing client card (e.g. the provider ManageCard) attach action
// controls inside the same card; omitted, the card is the plain browse visual.
export function ListingCard({ data, footer, href, ariaLabel }: { data: ListingCardData; footer?: ReactNode; href?:string; ariaLabel?:string }) {
  const copy=listingCardCopy(data.title,data.cardHeadline,data.cardSupporting,data.description)
  const content = <>
      <CardImage
        photoUrl={data.photoUrl}
        jobId={data.jobId}
        category={data.category}
        headline={copy.headline}
        supporting={copy.supporting}
        cardStyle={data.cardStyle}
      />
      <div className="lcard-body">
        {data.side && <div className="lcard-tagrow"><span className={'lcard-sidetag ' + data.side}>{data.side === 'job' ? 'Job' : 'Listing'}</span>{data.kindLabel && <span className="lcard-tagcat">{data.kindLabel}</span>}</div>}
        <div className="lcard-title" title={data.title || 'Untitled listing'}>{data.title || 'Untitled listing'}</div>
        {data.description!==undefined && <p className="lcard-description">{data.description}</p>}
        <div className="lcard-meta">
          {data.priceLabel && <span className={'lcard-price' + (data.side ? ' ' + data.side : '')}>{data.priceLabel}</span>}
          {data.kindLabel && !data.side && <span className="kind-tag">{data.kindLabel}</span>}
        </div>
        {data.badge && (
          <span className={`badge ${data.badge.tone}`}>{data.badge.label}</span>
        )}
      </div>
  </>
  return <div className="lcard">{href?<Link href={href} className="lcard-view" aria-label={ariaLabel || ('View listing: '+(data.title || 'Untitled listing'))}>{content}</Link>:content}{footer}</div>
}
