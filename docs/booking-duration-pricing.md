# Expected Booking Duration and Pricing UX

Branch: `codex/booking-duration-pricing`, based on approved integrated development release `584790d`. Local review only.

## Implementation

- Grazing requests use an accessible mobile selection sheet / web select with 1, 2, 4, 6, 8 weeks and Not sure yet. An unspecified choice persists as null, not a guessed duration.
- Time-based hire and on-site services use optional numeric duration in the advertised hour/day/week/month unit, with up to two decimal places. Unsupported time units are not guessed. Fixed-price services, goods and leases retain their existing request behavior.
- When quantity already means time (hourly, day-rate or an exact time unit), the existing selected quantity initializes the duration control. The control supplies that same quantity rather than multiplying time twice. Per-item rates such as head/week or machine/day retain their item quantity separately.
- Shared calculation: 2 head × $50/head/week = $100 weekly; four expected weeks = $400 indicative total. Minimum charges remain floors applied once to the full indicative estimate. No day/week/month conversion is invented. Four expected weeks against a monthly grazing rate therefore has no calculated total.
- Provider review and requester/provider booking details show quantity, saved unit rate, expected duration, period cost and indicative total, with existing timing, notes and status. The summary explicitly calls duration a request, not a binding agreement, and says final dates/duration/payment are agreed directly.
- New duration-capable mobile requests now retain the existing version-1 pricing snapshot format already used on web. Both clients retain listing kind in that snapshot, so subsequent listing edits cannot reinterpret the new estimate. Fixed-price mobile service requests keep their previous payload behavior.
- Public listing pages explain the duration/indicative-total step and use the existing authenticated booking handoff. No public booking endpoint or guest write path was added.
- Existing explicit acceptance confirmation, completion, cancellation, location privacy and payment acknowledgements remain unchanged. No automatic completion, end date, charging or payment processing was introduced.

## Pending migration and API compatibility

`supabase/migrations/20261125140000_booking_expected_duration.sql`

Adds two nullable booking columns:

- `expected_duration numeric`: optional positive value up to 10,000, at most two decimal places; grazing choices restricted to the supported week values.
- `expected_duration_unit text`: paired hour/day/week/month unit.

Database validation checks paired fields, supported values/units, advertised time-rate context, time-quantity consistency and whole-animal/capacity bounds. Duration requests require a pricing snapshot. Duration is immutable request information after creation; ordinary status changes preserve it. Validation reads the existing privacy-safe listing view; existing booking RLS and lifecycle update guards remain in force. No public execute grants are added for the internal validation functions.

Existing records remain null; no backfill, inference from notes or confirmed-term rewrite occurs. Historical duration notes remain visible verbatim. Records without a structured duration display To be agreed. Where no historical rate snapshot exists, the new period-cost row says Not recorded rather than inferring a historical price from a changed live listing.

The API change is additive optional insert/read fields on the existing bookings resource. No endpoint or RPC signature changes. Older mobile clients can omit the fields and continue using their existing notes/base estimates. Older clients do not render the new structured summary, but the data remains stored.

`total_amount` retains its existing base-estimate/quote meaning. Per-item period bookings store the base period estimate; the new full-duration indicative total is derived from saved quantity, rate snapshot and duration, not written over that amount. This avoids silently changing old booking/payment semantics.

The pending migration has **not** been applied to any persistent or remote database. It was exercised only inside an isolated local transaction that rolled back. On a separately approved deployment, apply the additive migration and verify PostgREST exposes the two fields before releasing updated clients. Retain the columns/validator when rolling clients back; do not drop stored duration terms. Older open web forms should be refreshed when the updated web app is deployed.

## Files changed

Production:

- `shared/bookingDuration.ts`
- `src/components/ExpectedDurationControl.js`
- `src/screens/BookingConfirmScreen.js`
- `src/screens/ServiceBookingDetailScreen.js`
- `provider-web/src/app/browse/[id]/request/request-form.tsx`
- `provider-web/src/app/work-actions.ts`
- `provider-web/src/app/activity/booking-details.tsx`
- `provider-web/src/lib/booking-detail.ts`
- `public-web/src/components/public-listing-detail.tsx`
- The pending migration above.

Tests/support:

- `tests/booking-duration.test.mjs`
- `tests/sql/booking-duration.test.sql`
- `tests/support/booking-duration-permissions.ps1`
- `tests/support/booking-confirm-screen.mjs`
- `tests/find-local-help.test.mjs`
- `tests/web-booking-detail.test.mjs`
- `tests/web-booking-modules.mjs`
- `tests/provider-home-booking-status.test.mjs`
- `tests/provider-booking-navigation.test.mjs`
- This report.

## Validation

- Full automated suite: 647 passed, zero failed.
- New focused duration suite: 12 passed, including mobile/web form rendering, selection, unsure choice, invalid values, indicative totals, no double multiplication, minimum-charge floors, snapshot stability, old records and unchanged fixed-price behavior.
- Existing requester/provider location-detail tests now also verify the 4-week/$400 summary under both roles, including confirmed native/web views.
- Existing web action tests verify structured persistence, invalid input rejection before insert, ownership/enquiry restrictions and unchanged base amounts.
- Local SQL tests passed using the actual baseline booking schema/RLS and existing lifecycle update guard, plus the pending migration. Covered old-client inserts, numeric precision, missing/invalid units, capacity/whole animals, immutable terms, unchanged provider acceptance and requester withdrawal, and outsider/anonymous isolation. All test DDL/data rolled back and the fixture server was stopped.
- Provider and public production builds passed. Existing nonblocking provider account/help package-version warning remains.
- Android and iOS local exports passed. Whitespace checks passed.

## Limitations and manual smoke checklist

Installed-device interaction and live booking creation remain manual until the migration/deployment is separately approved. No remote booking, schema or notification was changed for this task.

1. Android/iOS/web: request grazing for two animals at $50/head/week; choose four weeks. Verify $100 weekly, $400 indicative total, paired structured fields, notes unchanged and pending status.
2. Choose Not sure yet. Verify the weekly estimate remains, total is To be agreed, both duration fields are null and no duration is forced.
3. Check 1/2/4/6/8-week selection, cancellation of the mobile selector, invalid decimals/units via API, fractional animals and advertised capacity limits.
4. Provider: review quantity/rate/duration/total, notes and timing before accepting. Cancel the existing acceptance confirmation first, then deliberately accept. Both participants should see the same summary afterward.
5. Edit the live listing rate after request creation; verify saved request estimates do not change. Check an old booking without duration/snapshot and ensure original notes remain intact.
6. Hire $50/day for four days should indicate $200, not $800. Two machines at $20/machine/day for three days should indicate $120. Check hourly minimum charges once, optional duration clearing and a monthly grazing rate with week duration (no invented conversion).
7. Confirm fixed-price services still have no duration control, on-site location collection still works, grazing still uses provider location privacy, and goods/leases retain enquiry behavior.
8. Verify withdrawal, cancellation, completion and reviews still use existing controls, with no duration-based automatic transition or payment.

No merge, push, deployment, publication or persistent migration application. Property Map, Photo V1 and other work remain preserved in their original worktrees.
