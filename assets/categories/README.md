# Category placeholder images

These are the fallback pictures shown on job & service cards when a listing has
no photo of its own. One per category.

## How to add
1. Create the image and save it here with the **exact filename** below.
2. Open `src/lib/categoryImages.js` and **uncomment** that category's line.
3. Reload the app — cards for that category now show the picture. Any category
   without a file keeps its coloured icon.

Images bundle with the app and ship over EAS Update (no native rebuild needed).

## Filenames (all 12)
| Category | Filename |
|---|---|
| Fencing & Gates | `fencing-gates.jpg` |
| Animals & Farm Sitting | `animals-farm-sitting.jpg` |
| Water & Drainage | `water-drainage.jpg` |
| Spraying & Pest Control | `spraying-pest-control.jpg` |
| Land & Vegetation | `land-vegetation.jpg` |
| Cropping, Hay & Feed | `cropping-hay-feed.jpg` |
| Earthworks & Driveways | `earthworks-driveways.jpg` |
| Machinery & Repairs | `machinery-repairs.jpg` |
| Buildings & Maintenance | `buildings-maintenance.jpg` |
| Transport & Delivery | `transport-delivery.jpg` |
| Property & House Sitting | `property-house-sitting.jpg` |
| General Rural Help | `general-rural-help.jpg` |

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
