import type {ReactNode} from 'react'
import {listingAvailabilityDetail} from './listingAvailabilityDetail'
import type {ListingAvailability} from './listingAvailability'

type Tone = NonNullable<ReturnType<typeof listingAvailabilityDetail>>['tone']

export function ListingAvailabilityPanel({listing, icons}: {
  listing: ListingAvailability
  icons: Record<Tone, ReactNode>
}) {
  const detail = listingAvailabilityDetail(listing)
  if (!detail) return null

  return <section className="listing-availability" aria-labelledby="listing-availability-heading">
    <h2 id="listing-availability-heading">Availability</h2>
    {detail.status && <p className="listing-availability-status" data-tone={detail.tone}>
      {icons[detail.tone]}<span>{detail.status}</span>
    </p>}
    {detail.lead && <div>
      {detail.leadLabel && <p className="listing-availability-secondary">{detail.leadLabel}</p>}
      <p className="listing-availability-estimate">{detail.lead}</p>
    </div>}
    {detail.message && <p className="listing-availability-message">{detail.message}</p>}
    {(detail.disclaimer || detail.updated) && <div className="listing-availability-meta">
      {detail.disclaimer && <p className="listing-availability-secondary">{detail.disclaimer}</p>}
      {detail.updated && <p className="listing-availability-secondary">{detail.updated}</p>}
    </div>}
  </section>
}
