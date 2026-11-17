// Category artwork — a flat icon on the category's tint, shown on job / listing
// cards that have no photo. One map for the app and the web apps.
//
// Files: <name>.png in assets/categories/ (app) and public/images/ (web),
// drawn by scripts/render-category-art.mjs. Listing kinds other than services
// (grazing, hire, lease, for sale) have their own category sets, each with one
// picture for the kind.
const CATEGORY_ARTWORK: Record<string, string> = {
  'fencing & gates': 'fencing',
  'animals & farm sitting': 'animals',
  'water & drainage': 'water',
  'spraying & pest control': 'spraying',
  'land & vegetation': 'land',
  'cropping, hay & feed': 'cropping',
  'earthworks & driveways': 'earthworks',
  'machinery & repairs': 'machinery',
  'buildings & maintenance': 'buildings',
  'transport & delivery': 'transport',
  'property & house sitting': 'property',
  'general rural help': 'general',
  // Grazing listings
  'grazing': 'grazing',
  'agistment': 'grazing',
  'winter grazing': 'grazing',
  'dairy support': 'grazing',
  // Hire listings
  'machinery': 'hire',
  'trailers': 'hire',
  'yards & handling': 'hire',
  'implements': 'hire',
  // Lease listings
  'paddock/land': 'lease',
  'shed/building': 'lease',
  'storage': 'lease',
  // For-sale listings
  'hay & baleage': 'for-sale',
  'feed & supplement': 'for-sale',
  'livestock sundries': 'for-sale',
  'general': 'for-sale',
}

// The artwork name for a category ('general' when unknown).
export function categoryArtworkName(category: string | null | undefined): string {
  return CATEGORY_ARTWORK[(category || '').trim().toLowerCase()] || 'general'
}

// Web path of the artwork, served from public/images/.
export function categoryArtwork(category: string | null | undefined): string {
  return '/images/' + categoryArtworkName(category) + '.png'
}
