// Copy only requester-authored listing details. Lifecycle state, offers,
// questions, reviews, cancellations and provider details always stay attached
// to the original job.
export function repeatJobToJobData(job) {
  if (!job) return {}
  const scheduleType = job.schedule_type || 'flexible'
  return {
    category:           job.category || '',
    title:              job.title || '',
    scheduleType,
    // A previous calendar date must never silently carry into a new listing.
    scheduledDate:      null,
    dateFrom:           null,
    dateTo:             null,
    latitude:           job.latitude ?? null,
    longitude:          job.longitude ?? null,
    jobAddress:         job.location_name || '',
    locationNote:       job.location_note || '',
    areaPolygon:        job.area_polygon || [],
    areaHectares:       job.area_hectares ?? null,
    description:        job.description || '',
    photos:             job.photos || [],
    priceType:          job.price_type || 'fixed',
    price:              job.price == null ? '' : String(job.price),
    materialsType:      job.materials_type || 'none',
    accessConditions:   job.access_conditions || [],
    hideExactLocation:  !!job.hide_exact_location,
    locationArea:       job.location_area || '',
    repeatedFromJobId:  job.id,
    recurrenceFrequency: 'one_time',
  }
}
