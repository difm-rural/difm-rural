// Single unified taxonomy shared by BOTH marketplaces (jobs + services), with a
// second, more detailed layer of provider capabilities under each category.
// If you change this, also update:
//   - src/components/JobServiceCard.js  (CATEGORY_VISUALS icon map)
//   - supabase/functions/categorize-job (CATEGORIES — then redeploy)
//   - add a data migration remapping existing jobs.category / services.category

// Level 1 — browse categories (kept short so browse isn't overwhelming).
export const CATEGORIES = [
  'Fencing & Gates',
  'Animals & Farm Sitting',
  'Water & Drainage',
  'Spraying & Pest Control',
  'Land & Vegetation',
  'Cropping, Hay & Feed',
  'Earthworks & Driveways',
  'Machinery & Repairs',
  'Buildings & Maintenance',
  'Transport & Delivery',
  'Property & House Sitting',
  'General Rural Help',
]

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

// Jobs and services share one taxonomy — keep the old names as aliases so
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
