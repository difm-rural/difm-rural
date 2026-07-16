// Category placeholder illustrations/photos.
//
// To add one: drop a file into assets/categories/ (see that folder's README for
// names + specs), then UNCOMMENT its line below. Cards fall back to the category
// icon for any category without an image, so it's safe to add them one at a time.
//
// Keyed lowercase to match categoryVisual() / the unified taxonomy. require()
// paths must be static string literals (Metro can't resolve variables), and the
// file must exist or the bundle won't build — hence the commented template.
const CATEGORY_IMAGES = {
  // 'fencing & gates':          require('../../assets/categories/fencing-gates.jpg'),
  // 'animals & farm sitting':   require('../../assets/categories/animals-farm-sitting.jpg'),
  // 'water & drainage':         require('../../assets/categories/water-drainage.jpg'),
  // 'spraying & pest control':  require('../../assets/categories/spraying-pest-control.jpg'),
  // 'land & vegetation':        require('../../assets/categories/land-vegetation.jpg'),
  // 'cropping, hay & feed':     require('../../assets/categories/cropping-hay-feed.jpg'),
  // 'earthworks & driveways':   require('../../assets/categories/earthworks-driveways.jpg'),
  // 'machinery & repairs':      require('../../assets/categories/machinery-repairs.jpg'),
  // 'buildings & maintenance':  require('../../assets/categories/buildings-maintenance.jpg'),
  // 'transport & delivery':     require('../../assets/categories/transport-delivery.jpg'),
  // 'property & house sitting': require('../../assets/categories/property-house-sitting.jpg'),
  // 'general rural help':       require('../../assets/categories/general-rural-help.jpg'),
}

// Returns a require()'d image module for the category, or null to fall back to
// the category icon.
export function categoryImage(category) {
  return CATEGORY_IMAGES[String(category || '').toLowerCase()] || null
}
