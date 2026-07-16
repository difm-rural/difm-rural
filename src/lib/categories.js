// Single unified taxonomy shared by BOTH marketplaces (jobs + services).
// Kept deliberately short (10 specific + 1 catch-all) so browse isn't
// overwhelming. If you change this list, also update:
//   - src/components/JobServiceCard.js  (CATEGORY_VISUALS icon map)
//   - supabase/functions/categorize-job (CATEGORIES — then redeploy)
//   - add a data migration remapping existing jobs.category / services.category
export const CATEGORIES = [
  'Fencing & Gates',
  'Animals & Farm Sitting',
  'Water & Drainage',
  'Spraying & Pest Control',
  'Land & Vegetation',
  'Earthworks & Driveways',
  'Machinery & Repairs',
  'Buildings & Maintenance',
  'Transport & Delivery',
  'Property & House Sitting',
  'General Rural Help',
]

// Jobs and services now share one taxonomy — keep the old names as aliases so
// existing imports keep working.
export const JOB_CATEGORIES = CATEGORIES
export const SERVICE_CATEGORIES = CATEGORIES

// Filter-bar shape used by the browse / guest feed screens: [{ id, label }]
// with a leading "All".
export const CATEGORY_FILTERS = [
  { id: 'All', label: 'All' },
  ...CATEGORIES.map(c => ({ id: c, label: c })),
]

// True when a job title reads like house-sitting (used to surface the
// house-sitting-only options: date range, hide exact address).
export function isHouseSitting(title) {
  return /house.?sit/i.test(String(title || ''))
}
