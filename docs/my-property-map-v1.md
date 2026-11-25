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

### Security review — 25 November 2026 (NZ)

**Reviewed, not deployed.** Branch `feature/property-map-security-review` from `origin/main` `555dd05`, with the preserved validation-scripts commit cherry-picked. Nothing pushed, merged or applied.

**Access matrix for `private_property_maps`** (boundary, pin, gates, tanks, pumps, troughs, buildings, driveways and details are all in the one `profile` row):

| Caller | Read | Create | Modify | Delete row |
| --- | --- | --- | --- | --- |
| Owner, app session (`auth.uid() = owner_id`, no `client_id`) | yes | yes (own row only) | yes (own row only; features removed by saving) | no grant |
| Same owner via OAuth assistant token (`client_id` present) | **no** (new) | no | no | no |
| Another signed-in member | no | no | no | no |
| `anon` / guest | no (no grant) | no | no | no |
| `service_role` | bypasses RLS; server-only; no Edge Function uses it for this table | | | |

- **Finding (fixed):** assistant tokens could still **read** the full private map. The owner policy is `FOR ALL`, so it covers SELECT, and an assistant token carries the owner's subject. Only writes were guarded. rc-mcp never reads the table and promises towns/areas only. The sibling private tables (`property_network_contacts`, `property_network_contact_links`, `property_network_jobs`) already refuse assistant reads. New migration `20261125200000_private_property_map_assistant_read_guard.sql` adds a restrictive `"Assistants cannot read"` SELECT policy. It fails if any of the four guards is missing, if `anon` can read or if DELETE is granted.
- **Confirmed:** the three restrictive write guards, owner-only `WITH CHECK` (no creating or moving a row onto another account), no DELETE grant, no SECURITY DEFINER routine referencing the table, and geometry/size validation in the CHECK constraint. `property-address-search` refuses assistant tokens before auth or LINZ calls, with gateway JWT verification on. `maps-proxy` is unchanged.
- **AI suggestions:** map details only *suggest* support areas in the UI. Adding one needs an explicit owner tap, which goes through owner RLS and `accept_property_network_suggestion` / `link_property_network_provider`, and those refuse assistant tokens. Saving a map never changes support areas (SQL-tested).
- **Tests:** `tests/sql/private-property-map.test.sql` now asserts assistant read denial and continued owner read. It lifts the read guard inside the rolled-back transaction, so UPDATE/DELETE are still refused by their own guards. `tests/support/property-map-security.ps1` loads the deployed `is_assistant_token()` functions and the new migration. Passed on a fresh isolated PostgreSQL 17 cluster. Negative controls failed as intended: without the read guard (`Assistant read private map`) and without the update guard (`Assistant updated private map`).

**Deployment plan (when approved):**
1. Preserve `20261125140000_booking_expected_duration.sql` from the Booking Lifecycle baseline and its applied remote ledger entry. The final development integration includes that file; do not repair or reapply its migration history.
2. `supabase db push --dry-run` should list only `20261125200000_private_property_map_assistant_read_guard.sql`. Then push.
3. Read back the policies: four `RESTRICTIVE` policies on `private_property_maps`.
4. Hosted check: `tests/property-map-live.mjs` with a real OAuth assistant JWT must now also be denied **SELECT**, and owner save/reload must still work.
5. No Edge Function, provider-web or Expo release is needed: no client code changed.


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
