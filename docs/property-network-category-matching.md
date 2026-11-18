# Property Network category matching

The web and Expo service views now open a local matching panel from Find local help. The network still uses the existing radial diagram, List view, My Property fallback and Grow your network library. Badges read Not set up, Find help and a local-provider count. Provider cards show the matching offering, advertised area, public rating when available and relationship indicators. Profile, Save to My Locals, Add to Property Network and Invite to job reuse existing actions. Posting from an empty search prefills the category for review.

## Category mapping

The canonical category key is the stored category string in RC. Property Network uses its stable area and service keys to select those canonical values. A listing also needs a matching service phrase. Mappings are maintained in `shared/propertyMatching.ts`.

| Property area | Marketplace categories used by its individual services |
| --- | --- |
| Water | Water & Drainage, Transport & Delivery |
| Pasture & Land | Spraying & Pest Control, Cropping, Hay & Feed, Land & Vegetation |
| Fencing | Fencing & Gates |
| Livestock | Animals & Farm Sitting, Cropping, Hay & Feed |
| Access & Driveways | Earthworks & Driveways, Transport & Delivery, Water & Drainage |
| Property Upkeep | Buildings & Maintenance |
| Trees & Firewood | Land & Vegetation |
| Machinery | Machinery & Repairs, Cropping, Hay & Feed |

Custom services use their entered phrase and the existing area category. Water haulage, tank cleaning, shearing, grazing advice and other narrow needs lack dedicated listing service IDs. A generic category listing therefore requires explicit matching text. Equipment hire searches active service offerings in Machinery & Repairs. Standalone hire listings stay in the separate hire workflow.

## Location and privacy

Search starts with the requester profile region when present and allows a town or locality override and an explicit wider region. It matches normalized named areas in the advertised listing location. A saved or past provider must still meet both filters. Other locality results come next, then listings naming the opted-in region. Results do not infer travel, availability or quality. Location text and a travel radius exist on listings, but there is no structured coverage-area index or confirmed property locality in this release. Listings with sparse descriptions or location data may be missed. The query does not use the pending property map or any private property coordinates. No schema, RLS or mapping settings are needed.

## Validation and release

- The isolated release passed 302 repository tests. The development working copy also passed 309 tests, including seven for the separate pending Map V1 work.
- The provider web production build and Android and iOS Expo exports passed.
- Rollback-only local PostgreSQL fixtures passed for Property Network ownership and provider links, saved providers, invitations and invite-only access. The matching tests verify service and location filtering, order, widening and absence of private coordinate queries.
- Results are capped at 24 providers. Review information is optional if the review query fails. Signed-in hosted UI and physical-device interaction were not independently exercised.
- Both clients deployed from `3c82989de8afd0c9d34b3e893b27f662ced35845`. Vercel confirmed deployment `BTAR2yqPoTJFzp11GGEakUNHQcfU` succeeded. [Development site](https://dev.ruralconnections.nz/property-network) · [Vercel deployment](https://vercel.com/rural-connections/difm-rural/BTAR2yqPoTJFzp11GGEakUNHQcfU)
- Expo published Android and iOS to `preview`, runtime `1.0.0`, update group `9eef6e85-9003-4b88-8c00-0554e429fec8`. [Expo update](https://expo.dev/accounts/difmrural/projects/difm-rural/updates/9eef6e85-9003-4b88-8c00-0554e429fec8)
