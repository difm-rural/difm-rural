# Category placeholder images

These are the fallback pictures shown on job & service cards when a listing has
no photo of its own. One per category.

## How to add
1. Create the image and save it here with the **exact filename** below.
2. Open `src/lib/categoryImages.js` and **uncomment** that category's line.
3. Reload the app — cards for that category now show the picture. Any category
   without a file keeps its coloured icon.

Images bundle with the app and ship over EAS Update (no native rebuild needed).

## Filenames (all 12) — mapped in src/lib/categoryImages.js
| Category | Filename |
|---|---|
| Fencing & Gates | `fencing.jpg` |
| Animals & Farm Sitting | `animals.jpg` |
| Water & Drainage | `water.jpg` |
| Spraying & Pest Control | `spraying.jpg` |
| Land & Vegetation | `land.jpg` |
| Cropping, Hay & Feed | `cropping.jpg` |
| Earthworks & Driveways | `earthworks.jpg` |
| Machinery & Repairs | `machinery.jpg` |
| Buildings & Maintenance | `buildings.jpg` |
| Transport & Delivery | `transport.jpg` |
| Property & House Sitting | `property.jpg` |
| General Rural Help | `general.jpg` |

To replace an image, overwrite the file (keep the same name). The files are
currently flat illustrations exported as `.jpg` (PNG data — RN renders fine).

## Specs
- **Format:** JPG for photos (smaller). PNG only if you need transparency. If you
  use PNG, keep the filename the same but with `.png` and update the extension in
  `categoryImages.js`.
- **Aspect / size:** the same image is shown in two places and cropped to fill
  (`resizeMode="cover"`): a wide job card (~2.4:1) and a smaller service card
  (~1.4:1). Use a **landscape** image around **1000 × 700 px** with the subject
  centred so it survives cropping to either shape.
- **Weight:** keep each **under ~150 KB** (they ship in the app bundle). Compress
  before adding.
- **Style:** pick one look (all photos, or all illustrations) and keep it
  consistent across the set so the board reads as one system.
