// Category artwork filenames shared by the web apps; assets match mobile.
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
}
export function categoryArtwork(category:string|null){
  return '/images/'+(CATEGORY_ARTWORK[(category || '').trim().toLowerCase()] || 'general')+'.jpg'
}
