// Category taxonomy for BOTH marketplaces (jobs + services). The PURE taxonomy
// data now lives in /shared/categories.ts (the single source of truth shared with
// the web apps) and is re-exported below so every existing RN importer keeps
// working unchanged. The RN-coupled layers (provider capabilities, house-sitting
// detection) stay here. Category artwork lives in ./categoryImages.
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

import { CATEGORIES } from '../../shared/categories'

// Level 2 — provider capabilities (a detailed skill layer under each category).
// Providers select these; they're stored in profiles.skills (text[]).
export const CATEGORY_CAPABILITIES = {
  'Fencing & Gates': [
    'New rural fencing', 'Fence repairs', 'Electric fencing',
    'Gate installation and repairs', 'Post driving',
  ],
  'Animals & Farm Sitting': [
    'General animal care', 'Animal feeding', 'Stock checks',
    'Farm or lifestyle-block sitting', 'Livestock handling and moving',
  ],
  'Water & Drainage': [
    'Trough installation and repairs', 'Pipes and water-line repairs',
    'Water-tank installation and repairs', 'Pump installation and repairs',
    'Drainage and culvert work',
  ],
  'Spraying & Pest Control': [
    'Weed spraying', 'Gorse and scrub spraying', 'Crop spraying',
    'Fertiliser spreading', 'Rural pest control',
  ],
  'Land & Vegetation': [
    'Mowing, slashing, and topping', 'Hedge and shelterbelt trimming',
    'Tree pruning and removal', 'Scrub and section clearing',
    'Firewood cutting and splitting',
  ],
  'Cropping, Hay & Feed': [
    'Cultivation and sowing', 'Harvesting', 'Hay and silage baling',
    'Mowing and raking', 'Feed and supplement supply',
  ],
  'Earthworks & Driveways': [
    'Driveway grading and repairs', 'Gravel spreading',
    'Digger and excavation work', 'Track construction and maintenance',
    'Trenching and drainage work',
  ],
  'Machinery & Repairs': [
    'Tractor work', 'Machinery hire with operator',
    'Farm-machinery servicing and repairs', 'Small-engine repairs',
    'Welding and fabrication',
  ],
  'Buildings & Maintenance': [
    'General property maintenance', 'Shed construction and repairs',
    'Carpentry', 'Roofing and gutter repairs', 'Painting and water blasting',
  ],
  'Transport & Delivery': [
    'General rural delivery', 'Hay and feed delivery',
    'Machinery and equipment transport', 'Livestock transport',
    'Towing and vehicle recovery',
  ],
  'Property & House Sitting': [
    'House sitting', 'Property and security checks', 'Lifestyle-block checks',
    'Garden watering and basic care', 'Holiday property care',
  ],
  'General Rural Help': [
    'General farm labour', 'Seasonal work', 'Property and yard cleanup',
    'Lifting, loading, and moving', 'Short-notice help',
  ],
}

// Flat list of every capability (for matching / search).
export const ALL_CAPABILITIES = CATEGORIES.flatMap(c => CATEGORY_CAPABILITIES[c] || [])

// True when a job title reads like house-sitting (used to surface the
// house-sitting-only options: date range, hide exact address).
export function isHouseSitting(title) {
  return /house.?sit/i.test(String(title || ''))
}
