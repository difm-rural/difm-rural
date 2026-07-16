// Category placeholder illustrations (flat art, one per category), shown on job
// & service cards when a listing has no photo of its own.
//
// Files live in assets/categories/ (see that folder's README). Keyed lowercase
// to match the unified taxonomy / categoryVisual(). Any category without an
// entry falls back to its coloured icon. require() paths must be static string
// literals and the file must exist, or the bundle won't build.
//
// NOTE: files carry a .jpg extension but are PNG data — RN decodes by content,
// so this renders fine.
const CATEGORY_IMAGES = {
  'fencing & gates':          require('../../assets/categories/fencing.jpg'),
  'animals & farm sitting':   require('../../assets/categories/animals.jpg'),
  'water & drainage':         require('../../assets/categories/water.jpg'),
  'spraying & pest control':  require('../../assets/categories/spraying.jpg'),
  'land & vegetation':        require('../../assets/categories/land.jpg'),
  'cropping, hay & feed':     require('../../assets/categories/cropping.jpg'),
  'earthworks & driveways':   require('../../assets/categories/earthworks.jpg'),
  'machinery & repairs':      require('../../assets/categories/machinery.jpg'),
  'buildings & maintenance':  require('../../assets/categories/buildings.jpg'),
  'transport & delivery':     require('../../assets/categories/transport.jpg'),
  'property & house sitting': require('../../assets/categories/property.jpg'),
  'general rural help':       require('../../assets/categories/general.jpg'),
}

// Returns a require()'d image module for the category, or null to fall back to
// the category icon.
export function categoryImage(category) {
  return CATEGORY_IMAGES[String(category || '').toLowerCase()] || null
}
