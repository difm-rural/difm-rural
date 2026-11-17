// Category artwork (a flat icon on the category's tint), shown on job & service
// cards when a listing has no photo of its own. Which picture a category uses
// is in shared/categoryArtwork.ts; the files are drawn by
// scripts/render-category-art.mjs into assets/categories/.
//
// require() paths must be static string literals and the file must exist, or
// the bundle won't build.
import { categoryArtworkName } from '../../shared/categoryArtwork'

const ARTWORK = {
  fencing:    require('../../assets/categories/fencing.png'),
  animals:    require('../../assets/categories/animals.png'),
  water:      require('../../assets/categories/water.png'),
  spraying:   require('../../assets/categories/spraying.png'),
  land:       require('../../assets/categories/land.png'),
  cropping:   require('../../assets/categories/cropping.png'),
  earthworks: require('../../assets/categories/earthworks.png'),
  machinery:  require('../../assets/categories/machinery.png'),
  buildings:  require('../../assets/categories/buildings.png'),
  transport:  require('../../assets/categories/transport.png'),
  property:   require('../../assets/categories/property.png'),
  general:    require('../../assets/categories/general.png'),
  grazing:    require('../../assets/categories/grazing.png'),
  hire:       require('../../assets/categories/hire.png'),
  lease:      require('../../assets/categories/lease.png'),
  'for-sale': require('../../assets/categories/for-sale.png'),
}

// A require()'d image module for the category (general rural help when the
// category is unknown).
export function categoryImage(category) {
  return ARTWORK[categoryArtworkName(category)] || ARTWORK.general
}
