// Single source of truth for category lists.
// TODO: unify JOB_CATEGORIES and SERVICE_CATEGORIES into one taxonomy
// (requires migrating existing rows) — tracked from the June 2026 UX review.

export const JOB_CATEGORIES = [
  'Fencing', 'Maintenance', 'Property Check', 'House-sitting', 'Landscaping',
  'Animal Care', 'Machinery', 'Labour', 'Spraying',
  'Water', 'General Labour', 'Other',
]

export const SERVICE_CATEGORIES = [
  'Machinery', 'Labour', 'Water delivery', 'Animal care',
  'Maintenance', 'Fencing', 'Other',
]

// True when a job title reads like house-sitting (used to surface the
// house-sitting-only options: date range, unpaid/in-kind, hide exact address).
export function isHouseSitting(title) {
  return /house.?sit/i.test(String(title || ''))
}
