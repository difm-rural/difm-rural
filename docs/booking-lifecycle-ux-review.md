# Booking Lifecycle UX review

Branch: `codex/booking-lifecycle-ux`. Based on Expected Duration & Pricing commit `dd76c792efe7a943f8ce9cba83f10f43c339c208`, which contains the approved development UX integration and booking navigation work.

## Implementation

- Explicit provider acceptance retains the existing pending-state mutation guard and includes requester, saved quantity/rate, expected duration and indicative total. Success explains that remaining arrangements are agreed in Chat.
- Active grazing uses a concise confirmed status, primary Chat and full-width secondary Complete booking. Completion confirmation explains both choices and that no payment is collected or recorded.
- Shared historical summaries use saved snapshot rates; missing or incomplete snapshots show Not recorded rather than current advertised rates. Existing duration and pricing calculation are reused.
- Grazing location copy follows role and lifecycle. A requester is told location is shared only when authorised location data is present. Existing private-location query guards and database permissions are unchanged.
- Web consolidates participant/status/pricing, arrangements and reviews/management while retaining desktop Chat on the right. The request-sent banner is consumed per booking per browser session and its URL flag is removed.
- Completed grazing highlights independent role-specific reviews. Saved reviews replace creation prompts; loading errors offer retry. Mobile guards simultaneous review submissions; existing save/update logic and database unique index remain authoritative.
- Existing completion RPC, acceptance, cancellation, notifications, payment fields and read-only historical Chat are reused. Web completion now invalidates the actual booking details route.

## Files

Mobile: `src/screens/ServiceBookingDetailScreen.js`.

Shared: `shared/bookingLifecycleUx.ts`, `shared/bookingLocation.ts`, `shared/nextMove.ts`.

Provider web: `src/app/activity/actions.ts`, `src/app/activity/booking-details.tsx`, `src/app/bookings/[id]/page.tsx`, `src/app/work-actions.ts`, `src/components/work/booking-sent-notice.tsx`, `src/components/work/manage-actions.tsx`, `src/components/work/reviews-section.tsx`, `src/lib/booking-detail.ts` (paths relative to `provider-web`).

Tests: `tests/booking-lifecycle-ux.test.mjs`, `tests/provider-booking-navigation.test.mjs`, `tests/provider-completion.test.mjs`, `tests/provider-home-booking-status.test.mjs`, `tests/web-booking-detail.test.mjs`, `shared/nextMove.test.ts`, `tests/support/booking-duration-permissions.ps1`, `tests/sql/booking-lifecycle.test.sql`.

Public web has no booking lifecycle workspace to change; its existing booking handoff is retained.

## Migration and compatibility

No new schema, API, notification delivery or payment processing changes. Inherited `20261125140000_booking_expected_duration.sql` remains pending, unchanged and NOT applied remotely. Duration stays optional for existing records/clients. Deployment still requires the reviewed duration migration before duration-aware clients. No production or development backend was modified.

## Validation

- `npm test`: 658 passed, 0 failed.
- `tests/support/booking-duration-permissions.ps1 -Lifecycle`: passed against isolated local PostgreSQL, transaction rolled back. Exercises actual booking schema/RLS/update guard, pending duration migration and existing grazing completion RPC; checks selected booking only, close/relist, other bookings unchanged, saved terms, requester/outsider denial, independent reviews, duplicate index and reviewer ownership. Local server stopped afterward.
- Provider web and public web: `npm run build -- --webpack` passed, including TypeScript checks. Turbopack cannot resolve shared dependency junctions in this isolated worktree; webpack used for verification.
- `npx expo export --platform all`: Android/iOS exports passed.
- `git diff --check`: passed.

## Manual smoke tests and limits

1. Provider: open a pending grazing request, verify requester/quantity/saved price/duration; cancel acceptance, then explicitly accept. Verify success and requester notification. Repeat with an old booking lacking a snapshot/duration.
2. Both roles: confirmed view shows concise status, Chat primary, expected duration and totals; verify narrow Android/iPhone wrapping, scroll clearance and keyboard behaviour.
3. Requester: confirm authorised exact location remains accessible. Pending bookings and unrelated accounts must not gain private-address or pin access. Provider/requester location copy must differ as specified.
4. Provider: cancel completion without mutation. Complete one booking using each choice on separate test bookings; verify listing closes/reopens and neighbouring bookings/payment terms do not change.
5. Both roles: completed view highlights review; save once, verify submitted state, edit existing review, refresh and verify independent other-party review. Historical messages remain viewable and read-only.
6. Web: inspect two-column Chat, logical sections, map link and management actions; submit a new request, then revisit and verify request-sent success does not repeat in the same session.
7. Verify cancellation, quote acceptance, fixed-price services and ordinary booking navigation remain unchanged.

Automated tests and exports do not replace signed-in live smoke tests or physical-device visual inspection; these remain outstanding. Completion does not persist a historical relist/close decision: immediate success reflects the chosen action, while revisited provider completion panels describe the listing's current availability. Session success suppression is per browser session, not a new server-side record.

All work remains local. No merge, push, deployment, publication or remote migration performed. Unrelated Property Map and Photo V1 work remains in its original worktrees.
