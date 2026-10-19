// Category taxonomy for BOTH marketplaces (jobs + services). The PURE taxonomy
// data now lives in /shared/categories.ts (the single source of truth shared with
// the web apps) and is re-exported below so every existing RN importer keeps
// working unchanged. House-sitting
// detection stays here; capabilities are also shared. Category artwork lives in ./categoryImages.
//
// If you change the CATEGORIES list, update /shared/categories.ts — and also:
//   - src/components/JobServiceCard.js  (CATEGORY_VISUALS icon map)
//   - supabase/functions/categorize-job (CATEGORIES — then redeploy)
//   - add a data migration remapping existing jobs.category / services.category

// Pure taxonomy — single source of truth in /shared, re-exported for RN importers.
export {
  CATEGORIES,
  JOB_CATEGORIES,
  SERVICE_CATEGORIES,
  CATEGORY_FILTERS,
  LISTING_CATEGORIES,
} from '../../shared/categories'


// Level 2 — provider capabilities (a detailed skill layer under each category).
// Providers select these; they're stored in profiles.skills (text[]).
export { CATEGORY_CAPABILITIES, ALL_CAPABILITIES } from '../../shared/categories'

// True when a job title reads like house-sitting (used to surface the
// house-sitting-only options: date range, hide exact address).
export function isHouseSitting(title) {
  return /house.?sit/i.test(String(title || ''))
}
