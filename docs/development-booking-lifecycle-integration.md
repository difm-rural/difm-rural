# Combined development release with Booking Lifecycle UX

Branch: `codex/development-booking-lifecycle-integration`.

## History and scope

Created in an isolated worktree from fetched GitHub main `555dd0524fae47778a9d919558498f24bd616927`. Integrated the existing approved development history through `d55690de526fd72099bf7433c1b19f0422a93bc7` with a merge, retaining original commits:

- `03ffd07`: Listing Management Navigation.
- `7817416`: 14 px Home tile spacing.
- `04af107`: Pre-login Home and Sign-in UX.
- `2438262`: Provider Home and Booking Status UX.
- `4591ba5`: Provider Booking Navigation.
- `584790d`: previous approved UX integration.
- `dd76c79`: Expected Duration and Pricing.
- `d55690d`: Booking Lifecycle UX.

Current main's public-area validation, email changes and grazing capacity/whole-number protections are retained. Property Map, Photo V1 and separate investigation work were not incorporated or modified.

## Conflict resolution

Eight conflicted files: web request form, server work actions, booking-detail helper, mobile navigator, mobile booking confirmation, mobile listing details, Find Local Help tests and web test loader.

- Retained quantity validation at input, navigation, snapshot creation and server submission while adding structured optional duration and indicative totals. Invalid quantities cannot show a valid indicative total or submit a booking.
- Retained main's fractional-head and capacity errors, disabled controls, integer input modes and quantity limits.
- Retained the approved explicit guest sign-in/review/send flow. Main's additions to the superseded automatic sign-in posting functions were intentionally not restored; their quantity protection is present in the explicit posting path. Public-area validation still runs in the actual posting forms and backend.
- Retained existing booking acceptance guards, Chat routes, selected-booking completion RPC and independent review system.
- Adapted test mocks to combined imports and rendered summary rows. Replaced a date-expired offer test fixture with a relative future date; no offer business logic changed.

## Validation

- Complete `npm test`: **688 tests: 687 passed, 1 failed**.
- Remaining failure: `tests/public-area-format.test.mjs`, exhaustive BMP JavaScript/SQL parity, at U+088F. Reproduced from untouched `origin/main` sources in a separate fixture. Node v24.14.1 uses Unicode 17; JavaScript considers this a letter while the existing SQL migration's fixed ranges reject it. No test was skipped and no unrelated public-area schema/rule was changed. This is an outstanding deployment gate.
- All booking duration/lifecycle/navigation/quantity, Home attention, guest sign-in and listing navigation regressions passed, including four added combined duration/invalid-quantity checks.
- Local `tests/support/booking-duration-permissions.ps1 -Lifecycle`: passed. Loads actual booking RLS/update guard, pending duration migration, both current-main quantity triggers, existing completion RPC and review policies/index together; all fixture changes rolled back.
- Standalone current-main SQL tests `tests/booking-quantity-capacity.sql` and `tests/booking-head-whole-number.sql`: passed, rolled back.
- `tests/public-area-format.sql`: passed in an isolated UTF-8 database, rolled back. Initial SQL_ASCII fixture attempt could not convert Unicode data; rerun used the correct UTF-8 encoding.
- Provider and public web production builds with webpack: passed, including TypeScript. Existing provider account/help JSON version-import warnings remain. Webpack avoids the isolated worktree's dependency junction restriction in Turbopack.
- Android/iOS Expo exports: passed. Exports do not establish physical-device visual correctness.
- `git diff --check`: passed.
- No remote migration, deployment, publication or push performed. Local PostgreSQL stopped after checks.

## Migration readiness and older clients

Only new migration versus current main is `20261125140000_booking_expected_duration.sql`, identical to the approved duration commit. No new migration was created to resolve this integration.

The two nullable duration columns leave existing rows unchanged. Older clients omitting both fields can still create valid bookings; no new mandatory parameter or projection is required. Existing records without duration display To be agreed. Duration and pricing terms remain immutable after creation. Existing capacity and whole-number protections remain enforced. Older clients that send invalid grazing quantities receive a validation rejection, rather than bypassing those protections.

Local compatibility is verified with omitted-field requests, invalid values, immutable terms, requester/provider/anonymous access, acceptance and completion. The remote migration ledger and schema were not queried or changed in this preparation task. Confirm their exact state before deployment. Main includes quantity migrations timestamped later than the pending duration migration: if already applied remotely, the earlier pending duration migration may require the CLI's reviewed out-of-order migration workflow. Do not blindly apply every pending migration.

## Coordinated deployment sequence (requires further approval)

1. Resolve the known public-area Unicode parity failure in a separately reviewed fix, then require a green full suite. Retain this integration and the currently deployed privacy-compatible versions for rollback.
2. Inspect development Supabase migration ledger/schema and existing Vercel project/team, provider/public deployments and Expo preview/runtime configuration. Confirm authentication without stale saved-token overrides. Check whether main's public-area, capacity and whole-head migrations are already applied; review any other drift before proceeding.
3. Preview the exact migration plan. If the earlier duration timestamp is behind applied migrations, review an explicit include-all dry run and verify the only intended additions. Apply only the approved outstanding migrations with approval, including expected duration before duration-aware clients. Stop on any failure.
4. Run live permission and legacy-client omitted-duration creation checks using existing test accounts/data. Verify private listing locations remain protected and no unrelated member can mutate bookings.
5. Deploy provider web from the final reviewed integration commit, then public web. Confirm existing project IDs, commit metadata, request form handoff and auth routing. No new Edge Function implementation is introduced by the approved UX/duration work; inspect backend drift from main separately rather than redeploying functions indiscriminately.
6. Publish one Expo Preview OTA group for Android and iOS using the existing channel/runtime. Record group and per-platform IDs and verify the served update commit.
7. Smoke-test both roles: listing navigation and tile spacing; guest discovery/sign-in with explicit request submission; pending vs withdrawn Home attention and independent unread counts; grazing/hire/time-based service duration; fixed service/goods/lease behaviour; explicit acceptance; Chat; exact-location authorisation; completion/relist/close on one booking with another unaffected; independent reviews and read-only history.
8. Stop on authentication, migration, compatibility or deployment failures. Keep dependent components on compatible versions; do not knowingly continue an incompatible rollout.

Rollback: restore previous compatible web deployments and Expo preview bundles if necessary. Keep additive duration columns and existing privacy protections; do not roll back booking data, reverse completion or drop duration records to restore older UI. Older clients can ignore optional duration fields. Verify retained older bundles against database-enforced quantity/location rules. A schema rollback requires separate review, not an automatic down migration.

## Recommendation

Integration is prepared locally for review. **Do not deploy yet**: the full suite has one independently reproduced current-main Unicode parity failure. After a reviewed fix, rerun the full suite and confirm the remote migration ledger. Physical-device narrow-layout, signed-in end-to-end and live permission smoke tests remain deployment-time/manual checks.
