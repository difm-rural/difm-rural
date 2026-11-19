# My Property Map V1

The My Property node in My Property Network opens a private map editor on provider web and Expo. Owners can search by address or locality, place a pin, save the map position and zoom, and draw or edit an approximate boundary. They can record tanks, pumps, troughs, gates, buildings and sheds, and draw driveways with approximate lengths. Paddocks are recorded as a count. Optional property details, a manual area override and coordinate entry support partial profiles and editing when imagery is unavailable. Drawing changes can be undone before saving. The outline and measurements are approximate and have no cadastral standing.

Property details and features can suggest support areas such as Water, Access & Driveways, Livestock and Pasture & Land. Each addition requires an explicit owner action using the existing Property Network settings.

## Mapping and privacy

LINZ NZ Aerial imagery supplies tracing-compatible tiles. Web uses browser-native tile and drawing controls. Expo uses the existing native map package for overlays, drawing and gestures. Google’s satellite tracing restrictions cover roads and building outlines, which are part of this feature. The feature uses LINZ’s address service for lookup. [LINZ Basemaps](https://www.linz.govt.nz/products-services/data/linz-basemaps) · [LINZ attribution](https://www.linz.govt.nz/products-services/data/licensing-and-using-data/attributing-linz-basemaps-data) · [Google Maps Platform terms](https://cloud.google.com/maps-platform/terms)

Migration `20261118180000_private_property_map.sql` adds an owner-scoped `private_property_maps` table with authenticated owner-only RLS, geometry validation and revision-based conflict handling. Map geometry, features and optional details are stored separately from public profiles and jobs. The authenticated `property-address-search` function sends explicit search text to LINZ and returns matching address coordinates. Imagery requests reveal the viewed tile area to LINZ. Saved outlines and feature geometry are rendered locally.

## Validation

- All 304 repository tests passed, including geometry, fallback map input, browser pointer and keyboard handling, address filter construction, stale-save protection and navigation.
- Isolated PostgreSQL tests passed for owner access, denial for another signed-in account and guests, invalid geometry and existing Property Network behaviour.
- The provider web production build and Expo Android and iOS exports passed.
- Live LINZ imagery and address results, plus interaction on physical Android and iOS devices, remain to be verified once credentials are available.

## Deployment

### Deployment attempt — 19 November 2026 (NZ)

**Stopped before deployment for a material security issue**, as required by the deployment request. No migration, Edge Function, Vercel release, Expo update, or centre-node activation was performed in this attempt.

- Deployment commit: none. Local base is `5038de6`; the map implementation remains uncommitted. A read-only remote check returned main at `3542e4f60788c5af27a819a97cef63cb859a45a8`. Integration with that newer revision has not been performed.
- Security blocker: the pending `private_property_maps` migration grants authenticated owners INSERT and UPDATE, with only an owner RLS policy. Newer deployed assistant-token protections identify OAuth assistant sessions through `public.is_assistant_token()` and require restrictive write policies. The pending table has none of these guards, so a member's assistant token would satisfy its owner policy and could modify private boundaries and infrastructure through PostgREST. This is a source-review finding, not a live exploit test. The existing SQL map tests exercise owners, unrelated users and guests, but not assistant tokens. Add and verify the established restrictive write guards before resuming. Also review `property-address-search` against the existing member-acting Edge Function assistant-token refusal pattern before release.
- Migration status: read-only linked migration listing succeeded. `20261118180000` is unapplied; remote-only migration `20261118224050` must be retrieved and reviewed before confirming compatibility. Do not repair or overwrite the remote ledger to bypass this difference. No database push was attempted.
- Edge Function status: unchanged. This implementation introduces `property-address-search`; existing `maps-proxy` remains the shared Google Maps proxy and was not redeployed.
- Credential verification: no credential values were printed. Hosted LINZ key presence and build accessibility remain unverified. Supabase secret listing reported a missing access token; EAS account/environment commands failed DNS resolution in the restricted execution context. Further environment checks stopped when the security blocker was identified.
- Vercel deployment URL: none for this attempt; `dev.ruralconnections.nz` was not updated.
- Expo preview update group: none for this attempt.
- Testing: `npm test` passed **336/336** tests on the current working tree. PostgreSQL privacy execution, provider web production build, Android/iOS exports and hosted smoke tests were not run in this attempt after the security stop. Earlier validation above does not establish current hosted behaviour.
- Map interaction results: live aerial imagery, attribution while imagery is visible, address lookup, boundary drawing, approximate area, tanks, driveways, sign-out/sign-in persistence and hosted cross-account denial remain unverified. Physical Android/iOS interaction remains outstanding.
- Outstanding: resolve the assistant write bypass and add regression coverage; reconcile latest remote source and migration history; verify all three hosted variables without exposing values; then resume migration/function deployment, navigation activation, web/Expo release and actual mobile/web smoke tests. Jobs, payments, invitations, Marketplace Health and Cron were not changed.

Deployment is pending. No LINZ credential variables were found locally. Vercel project settings were inaccessible from this workspace, EAS Preview did not return its environment list, and the linked Supabase CLI reported a missing access token. Hosted key presence is unverified. Migration `20261118180000` and the Edge Function remain pending for this release. There is no Vercel deployment ID or Expo update group, and the synthetic-property smoke test is pending.

| Service | Required configuration |
| --- | --- |
| LINZ Basemaps NZ Aerial XYZ, Web Mercator | Set `NEXT_PUBLIC_LINZ_BASEMAPS_KEY` in the Vercel environment that builds `dev.ruralconnections.nz`. Set `EXPO_PUBLIC_LINZ_BASEMAPS_KEY` in EAS `preview` for both Android and iOS, and select that environment when publishing. Use client-appropriate keys. Restrict a web Developer key to the development domain and confirm native compatibility with LINZ before using a site-restricted key for Expo. |
| LINZ Data Service NZ Addresses, WFS layer `123113` | An authorised LDS account holder creates a **Data access only** key and enters it directly in the existing Supabase project's Edge Function secrets as `LINZ_LDS_API_KEY`. Keep this key server-only. |

LINZ Basemaps Standard access is free, allows 1,000 requests per minute and 1,000,000 per month, and expires after 90 days. Developer access is also free and has no published Standard limits. Renew any Standard test keys before expiry and rebuild the clients to pick up replacements. Both clients include links for LINZ copyright and imagery contributors. Verify these links while imagery is visible on each client. LINZ publishes NZ Addresses as free open data. The address function requests at most eight matches per search and uses an eight-second upstream timeout. No LDS per-key request quota was verified. [LINZ Basemaps specifications](https://basemaps.linz.govt.nz/docs/user-guide/technical-documentation/) · [LINZ attribution](https://www.linz.govt.nz/products-services/data/licensing-and-using-data/attributing-linz-basemaps-data) · [LDS API key instructions](https://www.linz.govt.nz/guidance/data-service/linz-data-service-guide/web-services/creating-api-key) · [NZ Addresses dataset](https://data.linz.govt.nz/layer/123113-nz-addresses/)

Once those keys are available, verify address searches and imagery, check the linked migration dry run, apply the reviewed migration, deploy `property-address-search` with JWT verification enabled, and release the same revision to `dev.ruralconnections.nz` and Expo `preview`. Smoke-test save and reload on both platforms with test accounts, including cross-account denial and the existing Property Network navigation. Pending credential availability and live checks, hold deployment.
