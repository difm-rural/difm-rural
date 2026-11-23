# Find Local Help UX — Release 1 local review

## Delivery state

Implemented locally on `feature/find-local-help-ux-1`, in `C:/Users/OEM/difm-rural/.expo/find-local-help-ux-1`.
Base: main `e54a0c5`. Changes were reviewed for a local commit; see the branch log for its hash. No merge, push, deployment, publication or remote migration was performed.
The original `feature/property-network-integration` worktree and its unrelated modified/untracked files are unchanged.

## UX changes

- One Find local help marketplace, with All, Services, Grazing, Equipment and Goods filters. Mobile filters immediately update results; web links preserve search/location options. Existing listing kinds and category values remain unchanged. Legacy resource categories are recognised; land leases group with Grazing, storage/building leases with Services. The existing Lease option remains usable on web.
- Clear heading/subtitle/search wording, compact My listings navigation and a Post a job action in empty results. Bottom navigation is unchanged.
- Listing title and price scroll away with the content, leaving compact Back navigation on mobile. Photos remain prominent. Provider summaries and review links reuse existing identities, reputation and review routes; the full recent-review list is replaced with a summary on the mobile listing screen.
- Grazing prices read “$50 per head per week”, with head count distinct from the pricing period. Quantity/capacity/minimum-charge calculations and rate selection remain the existing calculator. Requests keep the selected quantity, explain the one-period estimate, shorten payment copy and offer optional expected duration in the existing notes field.
- Grazing location is labelled “Where the animals will graze”. Provider addresses/pins are never copied into requester location fields. A general area can be entered while the exact location is agreed with the provider.
- Successful mobile requests show Booking request sent!, provider/listing/status and View booking / Back to listings. View booking receives the exact saved record ID. Stable IDs, synchronous submission guards and ignore-duplicate inserts protect taps/retries; sign-in resumption also uses the same success experience and ID, including legacy drafts.
- Requester Activity and completed-history cards fill the available width. Names, titles, prices and status text wrap; the image/status overlay respects the card width. Pending copy explains who acts next. Received-provider action logic and active provider carousels remain unchanged. Booking withdrawal moves to secondary controls in the existing booking-details screen, using the existing cancellation modal and guarded mutation.
- Booking details distinguish public listing area, private requester-provided booking location and the private listing location available after acceptance. Existing Chat, Enquire, profile, reviews, acceptance and lifecycle workflows remain in place.

## Necessary database change — LOCAL ONLY

`supabase/migrations/20261124120000_listing_location_privacy.sql`

The pre-existing active-listing SELECT policy exposes exact stored addresses and both coordinate pairs through direct `services` reads. Hiding a map in the UI would not fix that defect.

The pending migration adds:

- `services_public`, a read-only security-barrier view exposing locality-only location names, null exact-coordinate/direction fields and explicitly approximate browsing coordinates. Coordinates are rounded to a 0.1-degree grid, falling back to the existing service-area coordinates when necessary.
- A restrictive raw-table SELECT policy, retaining raw location access for the owner, existing administrators and accepted booking requesters. The accepted participant predicate uses a fixed-search-path security-definer function to avoid policy recursion. An explicit participant policy preserves exact-location access when a listing closes.
- Public active listing discovery and participant history remain available through the safe view; closed listings are not exposed to unrelated members. Booking ownership policies and write/acceptance/payment rules are not modified.

Existing raw address/pin values are preserved. No new booking lifecycle, payment processing or duration column is introduced. Public discovery, profile, messaging, relationship, booking-embed and assistant consumers switch to the safe view; that accounts for most of the small one-line changes outside the UX screens. Owner listing-edit/write queries remain on `services`.

## Validation

- `npm test`: **527 passed, 0 failed, 0 skipped**.
- Focused tests execute the real booking-confirm component for quantity preservation, no address/pin copying, success navigation, concurrent taps, retry with the same ID, cancellation without submission and optional duration. They also execute the real Activity card, guest-resume function and existing cancellation mutation.
- Existing and expanded web booking tests cover request creation, changed pricing, invalid inputs, duplicate retries, failed insertion, role differences, quote acceptance and saved pricing. Fixed their shared-import harness so the previously unexecuted server-action tests actually run.
- Existing discovery/distance, Enquire/Chat, relationship and profile tests pass with the public view.
- `tests/support/listing-location-privacy.ps1`: **passed** against the existing isolated local PostgreSQL fixture on port 56432. Applies the actual pending migration inside a transaction; validates anonymous/pending/confirmed/owner/other-member access, masked fields, approximate coordinates and closed-listing history; rolls back all DDL/data.
- Provider web: `npm run build -- --webpack` **passed**, including TypeScript and page generation.
- Public web: `npm run build -- --webpack` **passed**, including TypeScript and page generation.
- `CI=1 npx expo export --platform all --output-dir .expo/find-help-export`: **passed** for Android and iOS. Nothing was uploaded.
- `git diff --check`: passed.

Webpack was used because the isolated worktree reuses installed dependencies through directory junctions outside its Turbopack root. No build configuration or dependency versions were changed. Provider web reports an existing package-version named-import warning in the untouched Account Help page; the build completes successfully.

## Limitations and release coordination

See `find-local-help-ux-1-deployment.md` for the reviewed dependency matrix, Property Network compatibility, deployment order and rollback plan. Development already records Property Network migration `20261124090000`; only the UX privacy migration remains pending there. OTA runtime compatibility does not guarantee cached clients have updated.

- Expected duration is optional editable notes, not a priced term. Grazing estimates still cover one stated week/month; they do not imply a full multi-period total or charge the requester. Duration and payment schedule require agreement.
- Distances are approximate grid-based distances, not exact pins or verified town centres. Listings near a radius boundary may move across that boundary after coarsening; listings with no usable coordinates remain available under All New Zealand.
- No physical iPhone/Android or hosted end-to-end smoke test has been claimed. The new database objects remain unapplied remotely. PostgREST's inferred view relationships and live account navigation must be checked in staging after migration approval.
- Older clients that directly browse `services` will be denied public raw-table reads after the migration. Migration and web/mobile/assistant consumer updates require coordinated rollout and a client-version plan; do not apply the migration alone.
- This feature branch starts from main and deliberately excludes the two Property Network Integration commits. A future release must integrate/preserve the already-deployed Property Network work separately; do not publish this worktree snapshot as a replacement for that release without integration review.
- No existing remote accounts, listings, bookings or network records were modified. The $50/head/week grazing scenario is exercised locally. Use the existing synthetic requester/provider accounts for staged manual checks; do not create extra infrastructure.

## Short staged mobile smoke checklist

1. On a narrow iPhone and Android device, browse all five filters, search for grazing and change radius/location; check unknown-location results under All New Zealand and the empty-state Post a job action. Check My listings and unchanged bottom tabs.
2. Open the existing grazing listing with the requester account. Confirm title/price/photo/provider/review access, clean scrolling, quantity/capacity limits and no public street address or exact Maps link.
3. Select a quantity, open booking request, check head count / unit price / one-period estimate, optional duration and blank requester location/pin. Cancel once and verify no booking appears.
4. Submit once, double tap and retry after a connection interruption. Confirm one record, correct provider and amount, and direct View booking navigation. Repeat the sign-in handoff using an existing test account; Back to listings must not submit again.
5. Check Activity filtering and full-width cards, status/counterpart wrapping and card navigation. Withdraw a pending request from details, then confirm a separate request as the provider and check cancellation permissions differ appropriately.
6. Check Enquire and Chat, provider profile and all reviews. Verify a stranger/pending requester cannot query raw listing locations; after acceptance the authorised requester and provider retain the appropriate exact location. Check web equivalents and closed-listing booking history.

## Complete changed-file inventory

`docs/find-local-help-ux-1.md` plus:

- `docs/find-local-help-ux-1-deployment.md`
- `provider-web/src/app/activity/booking-schedule-actions.ts`
- `provider-web/src/app/activity/page.tsx`
- `provider-web/src/app/bookings/[id]/page.tsx`
- `provider-web/src/app/browse/[id]/page.tsx`
- `provider-web/src/app/browse/[id]/request-panel.tsx`
- `provider-web/src/app/browse/[id]/request/page.tsx`
- `provider-web/src/app/browse/[id]/request/request-form.tsx`
- `provider-web/src/app/browse/page.tsx`
- `provider-web/src/app/connections/connection-listings.tsx`
- `provider-web/src/app/globals.css`
- `provider-web/src/app/page.tsx`
- `provider-web/src/app/people/[id]/page.tsx`
- `provider-web/src/app/work-actions.ts`
- `provider-web/src/components/discovery-search.tsx`
- `provider-web/src/lib/activity-data.ts`
- `provider-web/src/lib/booking-detail.ts`
- `provider-web/src/lib/connections-data.ts`
- `provider-web/src/lib/discovery-data.ts`
- `provider-web/src/lib/discovery.ts`
- `provider-web/src/lib/messaging-data.ts`
- `public-web/src/components/guest-card.tsx`
- `public-web/src/components/public-browse.tsx`
- `public-web/src/lib/marketplace.ts`
- `shared/aiConnector.ts`
- `shared/findLocalHelp.ts`
- `shared/nextMove.test.ts`
- `shared/nextMove.ts`
- `shared/propertyMatching.ts`
- `shared/propertyNetwork.ts`
- `shared/trustedLocals.ts`
- `src/components/EnquiryPersonCard.js`
- `src/components/JobServiceCard.js`
- `src/components/ServiceListCard.js`
- `src/lib/bookingDetail.js`
- `src/lib/messageThreads.js`
- `src/lib/nextMove.js`
- `src/lib/notifications.js`
- `src/navigation/AppNavigator.js`
- `src/screens/BookingConfirmScreen.js`
- `src/screens/ConnectionDetailScreen.js`
- `src/screens/LandingScreen.js`
- `src/screens/ProviderProfileScreen.js`
- `src/screens/ServiceBookingDetailScreen.js`
- `src/screens/ServiceDetailScreen.js`
- `src/screens/tabs/ActivityTabScreen.js`
- `src/screens/tabs/BrowseTabScreen.js`
- `supabase/migrations/20261124120000_listing_location_privacy.sql`
- `tests/ai-connector.test.mjs`
- `tests/find-local-help.test.mjs`
- `tests/manage-job-ux.test.mjs`
- `tests/message-threads.test.mjs`
- `tests/my-people.test.mjs`
- `tests/property-matching.test.mjs`
- `tests/provider-completion.test.mjs`
- `tests/provider-profile.test.mjs`
- `tests/public-browsing.test.mjs`
- `tests/sql/listing-location-privacy.test.sql`
- `tests/support/activity-card.mjs`
- `tests/support/booking-confirm-screen.mjs`
- `tests/support/listing-location-privacy.ps1`
- `tests/trusted-locals-stage3.test.mjs`
- `tests/web-booking-detail.test.mjs`
- `tests/web-discovery-modules.mjs`
- `tests/web-messaging-data.test.mjs`
