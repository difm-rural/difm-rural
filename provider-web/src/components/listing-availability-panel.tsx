import {CircleCheck, CirclePause, Clock} from 'lucide-react'
import {listingAvailabilityDetail} from '@shared/listingAvailabilityDetail'
import type {ListingAvailability} from '@shared/listingAvailability'

const statusIcons = {accepting: CircleCheck, limited: Clock, paused: CirclePause}

export function ListingAvailabilityPanel({listing}: {listing: ListingAvailability}) {
  const detail = listingAvailabilityDetail(listing)
  if (!detail) return null
  const StatusIcon = statusIcons[detail.tone]

  return <section className="listing-availability" aria-labelledby="listing-availability-heading">
    <h2 id="listing-availability-heading">Availability</h2>
    {detail.status && <p className="listing-availability-status" data-tone={detail.tone}>
      <StatusIcon size={18} aria-hidden="true" /><span>{detail.status}</span>
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
