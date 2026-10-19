// Shared, UI-free category taxonomy — the single source of truth for both the
// React Native app and the web apps. Pure data only: NO React/React Native,
// no asset requires, no bundler-specific imports, no dependency on src/lib, so
// any bundler can consume it. Authored in TypeScript so every consumer gets real
// types from source (Metro/babel-preset-expo strips the types for the RN app).
//
// RN-coupled bits (category artwork `categoryImage`, the provider-capability
// layer `CATEGORY_CAPABILITIES`/`ALL_CAPABILITIES`, and `isHouseSitting`) stay in
// src/lib — direction is app -> shared, never shared -> app.
//
// If you change CATEGORIES, also update:
//   - src/components/JobServiceCard.js  (CATEGORY_VISUALS icon map)
//   - supabase/functions/categorize-job (CATEGORIES — then redeploy)
//   - add a data migration remapping existing jobs.category / services.category

import type { ListingKind } from './listingPricing'

// Level 1 — browse categories (kept short so browse isn't overwhelming).
export const CATEGORIES: string[] = [
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

// Jobs and services share one taxonomy — keep the old names as aliases so
// existing imports keep working.
export const JOB_CATEGORIES: string[] = CATEGORIES
export const SERVICE_CATEGORIES: string[] = CATEGORIES

// Filter-bar shape used by the browse / guest feed screens: [{ id, label }]
// with a leading "All".
export const CATEGORY_FILTERS: { id: string; label: string }[] = [
  { id: 'All', label: 'All' },
  ...CATEGORIES.map(c => ({ id: c, label: c })),
]

// Kind-dependent browse categories for Listings (L2). `service` reuses the full
// labour taxonomy; resource kinds get their own short sets. Storage lives under lease.
export const LISTING_CATEGORIES: Record<ListingKind, string[]> = {
  service:  CATEGORIES,
  grazing:  ['Grazing', 'Agistment', 'Winter grazing', 'Dairy support'],
  hire:     ['Machinery', 'Trailers', 'Yards & handling', 'Implements'],
  lease:    ['Paddock/land', 'Shed/building', 'Storage'],
  for_sale: ['Hay & baleage', 'Feed & supplement', 'Livestock sundries', 'General'],
}

// Provider capabilities shared by the mobile and web profile editors.
export const CATEGORY_CAPABILITIES: Record<string, string[]> = {
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
