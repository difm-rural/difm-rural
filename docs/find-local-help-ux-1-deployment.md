# Find Local Help UX Release 1 — review and deployment plan

Reviewed 24 November 2026. This is a plan only: no merge, push, remote migration, deployment or publication is authorised by this review task.

The features have since been integrated locally for combined validation. See `combined-development-release.md` for the current integration branch, results and readiness recommendation. The older-client rollout requirements below still apply; the feature-only baseline warnings describe the original UX branch.

## Scope and local commit

The local change set implements the agreed discovery → listing → booking request → confirmation → Activity → booking-details UX. Existing pricing calculation, quantities, acceptance, messages, cancellation guards, job posting and payment rules remain the existing implementations. Optional expected duration uses notes, not a new lifecycle field.

The broader one-line query changes are necessary consumers of the location-privacy fix. Their matching fixture changes and the repaired server-action import harness are relevant regression coverage. No package/dependency/native configuration changes are included. The unrelated Property Map document, `.easignore` and three Property Map test files in the original worktree are excluded. The complete UX file inventory is in `find-local-help-ux-1.md`.

## Migration review and query dependencies

**Pending UX migration:** `supabase/migrations/20261124120000_listing_location_privacy.sql`.

- Creates `services_public`, a read-only security-barrier definer view. The explicit visibility predicate allows active, unclosed listings plus the owner's/participants' historical context. `location_name` becomes locality-only; `latitude`, `longitude`, `service_latitude` and `service_longitude` are null. A private `location_note` is also nulled if present. The supply/demand `direction` field remains unchanged. Public distance coordinates use a 0.1-degree grid, including the existing service-area fallback.
- The restrictive raw `services` SELECT policy applies alongside existing permissive policies. Owners, existing administrators and accepted requesters retain raw location access; a participant policy also permits access to closed listings. The helper has a fixed empty search path and revoked PUBLIC execution, with the necessary role grants. Booking RLS and write/lifecycle policies remain unchanged.
- Authenticated users receive SELECT only on the view. Owner listing editing and management continue to use raw `services`; authorised booking-details queries explicitly retrieve raw location only in the appropriate lifecycle states.
- The view projection is constructed from the schema at migration time. Current remote column metadata was reviewed: exact location fields are the masked address and coordinate columns. Re-review the projection if other schema changes add private listing columns before deployment.
- This is a versioned, transactional, one-time migration, not a script to run repeatedly. Do not repair migration history or reapply an already-recorded version.

The updated consumers **require the view to exist**:

| Consumer | Dependent queries |
| --- | --- |
| Mobile discovery/details/profiles | `BrowseTabScreen`, `LandingScreen`, `ServiceDetailScreen`, `ProviderProfileScreen`, `ConnectionDetailScreen`, `ServiceListCard` data and `AppNavigator` listing badge reads |
| Mobile booking/Activity/Home | `bookingDetail.js` and `ActivityTabScreen`/`nextMove.js` embeds use `services_public`, retaining existing `service`/`services` aliases |
| Mobile messaging | Listing subjects/identities in `messageThreads.js`, `notifications.js`, `EnquiryPersonCard.js` |
| Provider web | Discovery loader, `/browse`, listing/request pages, booking creation/responses, Home/Activity/booking schedule/detail embeds, profiles, connections and messaging |
| Public web | `public-web/src/lib/marketplace.ts` listing queries and distance projection |
| Shared relationships/Property Network | Listing lookups in `trustedLocals.ts`, `propertyMatching.ts`, `propertyNetwork.ts` |
| Connected assistant | Listing/activity/conversation reads in `shared/aiConnector.ts`, consumed by the existing `rc-mcp` function |

Metadata-only checks against development confirmed the locality/admin helper functions and required service columns exist. `services_public` and `can_read_listing_location(uuid)` do not yet exist remotely. No remote data or schema was changed during this review.

## Property Network compatibility

`834dfd2` contains the integration commit `d2f5d78` and posting follow-up. Its migration is:

`supabase/migrations/20261124090000_property_network_job_links.sql`

**It is already applied in the linked development database**, verified from migration history during this review. The job-link table and provider-replacement RPC also exist. It is not a pending development migration now. Other environments still need their own history checked.

The two migrations affect separate objects: Property Network changes private area/job links and provider assignment; Find Local Help changes public listing reads. Neither requires the other's new object. The normal order is Property Network `090000`, then privacy `120000`; do not reapply `090000` in development.

Only two changed files overlap with the Property Network commits: `provider-web/src/app/work-actions.ts` and `tests/web-booking-detail.test.mjs`. A content-only three-way check against common base `e54a0c5`, with Windows working-tree line endings normalised, merges both cleanly. No real merge was performed. Preserve Property Network origin validation/automatic job linking and the UX booking/view-query changes when they are integrated. Re-run the combined tests afterwards; clean textual merging is not combined-runtime validation.

This UX branch starts at main `e54a0c5`; **do not deploy its snapshot directly over development**, which already runs Property Network `834dfd2`. An approved future release tree must contain both sets of changes and both migration files. Do not run a blanket database push from a tree missing the applied Property Network migration.

## Expo compatibility and rollout gate

The app retains version `1.0.0`, runtime policy `appVersion`, the same Expo project and Preview channel. The last verified Android/iOS Preview updates at `834dfd2` use runtime **`1.0.0`**. No native dependency/configuration changes mean these changes can be delivered as an EAS update to matching Preview binaries; confirm each actual test device's runtime before publication.

Runtime compatibility does **not** make the database change backwards compatible. Existing embedded/cached bundles still read raw `services` and may lose discovery, listing context and booking/messaging subjects after hardening. OTA delivery is asynchronous; an already-open/offline app can keep its old bundle, and a different runtime cannot receive this update. There is no newly added forced-update gate. Publishing an OTA does not prove that every device loaded it.

Treat migration and **all affected clients** as one coordinated release. Supabase → provider web → Expo alone is incomplete while the public website or `rc-mcp` function still use old raw reads. Include those existing consumers in deployment approval, or explicitly gate their availability. Do not silently leave them broken.

## Concise deployment sequence — after separate approval

1. Prepare and review an integration tree containing `834dfd2` and the local UX commit; preserve unrelated work. Run full tests, both web builds and Android/iOS exports again on that exact tree. Record current Vercel deployments, public-web deployment, assistant version, Expo update group and migration history. Recheck target development project `opagkgfxmjqmnvhrcris`, Vercel `rural-connections / difm-rural` and its development domain.
2. Choose a compatibility strategy **before** deployment. With the current single transactional privacy migration, use a controlled development/testing maintenance window: stop test activity, accept temporary unavailability of old bundles, and require every supported test device to load the new Preview update before resuming. If uninterrupted/old-client compatibility is required, first review a change splitting additive view creation from later restrictive-policy activation; that staged plan is not implemented by this commit.
3. **Supabase:** verify the exact migration list and backup/restore arrangements; apply only the approved privacy migration, leaving the recorded Property Network migration intact. Verify masked anonymous/pending reads, owner/accepted/admin access, closed-history access and PostgREST `services_public` embeds. Stop on any failure.
4. **Provider web:** deploy the integrated release to the existing project serving `dev.ruralconnections.nz`; do not relink/recreate it. Verify Ready state and alias, login, discovery, requests, exact-record confirmation, Activity, cancellation and Property Network automatic job linkage. Deploy/verify public web and the existing `rc-mcp` consumer too, if included in the release approval. Stop on failure before publishing mobile.
5. **Expo Preview:** publish one update group for Android and iOS from the exact integrated commit using the existing Preview environment/channel. Record both update IDs, group, runtime and source hash. Load the update on actual narrow iPhone/Android test devices, restarting/reloading as needed; verify the running update ID, not just publication success.
6. Smoke-test existing requester/provider accounts: grazing price/quantity/duration/location; cancel before submit; double tap/retry; View booking opens the saved record; Activity/profile/reviews/Enquire/Chat; withdrawal versus accepted cancellation; public versus participant locations; Property Network assign/replace/remove, existing job links and Needs help auto-linking. Resume testing only when supported clients are on the compatible update. Stop and report any failure.

## Rollback considerations

- Prefer a forward fix while retaining privacy. Keep `services_public` available for any new client already downloaded; it is additive and contains no new business data.
- An ordinary Vercel or Expo rollback to `834dfd2` **alone is unsafe** while the restrictive policy remains: those clients read raw `services`. Keep a privacy-compatible rollback bundle/deployment, or keep affected testing paused until a fix is available. Restoring old clients does not require deleting bookings or Property Network data.
- Removing the restrictive policy would restore old public raw-location access and reintroduce the defect. Do not treat it as an automatic rollback. It requires explicit approval and a privacy-impact decision. Do not drop the view/helper while compatible clients can still run.
- Never roll back the already-applied Property Network migration as part of this UX release. Preserve existing job associations, provider assignments and newly created booking IDs.
- Keep migration history truthful; use a separately reviewed forward corrective migration if needed. Do not use `migration repair`, destructive resets or database restores to solve a client compatibility problem.

## Validation evidence and remaining requirements

Review-time `npm test`: **527 passed, zero failures**. The prior implementation checks passed both web production builds (Webpack), Android/iOS exports and local transaction-only SQL privacy tests; application code was not changed during this review. `git diff --check` passes.

Still required before release approval: combined Property Network + UX tests/builds; actual PostgREST view-embed checks; narrow iOS/Android running-update checks; existing-account hosted requester/provider smoke tests; owner/admin/anonymous/stranger access matrix; closed-listing history; verification of every affected consumer and the selected old-client strategy. No claim is made that these staging/device checks have already run.
