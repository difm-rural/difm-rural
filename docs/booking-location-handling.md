# Booking location handling — local review

Branch: `codex/booking-location-handling`, based on `5143db6`. Reviewed for local integration. No push, main merge, deployment, publication or remote database change.

## Behaviour

| Listing | Location handling |
| --- | --- |
| Grazing | Read-only provider public town/area; no requester address, directions or pin inputs. Exact location/access agreed with provider. New booking location fields are null, including when stale/forged input is supplied. |
| On-site service | Required requester location; existing optional map pin and directions retained. |
| Equipment hire | Public provider area plus collection/delivery agreement wording. Existing requester location/pin fields optional and labelled for delivery. A pin requires a delivery address. |
| Goods for sale | Existing enquiry-only workflow retained; collection/delivery agreed with seller. |
| Lease | Existing enquiry-only workflow retained; location/viewing/access agreed with provider. |

Provider exact-location disclosure remains controlled by existing sidecar queries and database permissions. No private-location queries, grants, lifecycle transitions or acceptance rules changed. Historical booking locations are retained. No migrations or API changes required; existing booking location columns are nullable. Equipment listings have no separate collection/delivery option, so this uses existing optional fields and agreement wording.

## Files

- `shared/bookingLocation.ts`: shared category policy, safe locality summary and booking location validation/payload fields.
- `src/screens/BookingConfirmScreen.js`: conditional collection, guest/submission validation and payload construction.
- `provider-web/src/app/browse/[id]/request/request-form.tsx`: corresponding web form.
- `provider-web/src/app/work-actions.ts`: enforce policy using fetched listing kind, ignoring forged grazing location fields.
- `src/screens/ServiceDetailScreen.js`, `provider-web/src/app/browse/[id]/page.tsx`, `public-web/src/components/public-listing-detail.tsx`: enquiry/location wording.
- `src/screens/ServiceBookingDetailScreen.js`, `provider-web/src/app/activity/booking-details.tsx`: booking location headings/explanations.
- `provider-web/src/lib/booking-detail.ts`: type the public area already returned by the existing query.
- `tests/booking-location.test.mjs`, `tests/web-booking-detail.test.mjs`: focused category, privacy, native submission, web submission and ownership regressions.
- Existing test harness imports updated in `tests/support/booking-confirm-screen.mjs`, `tests/grokbot-release1.test.mjs`, `tests/job-form-feedback.test.mjs`, `tests/property-network-posting-web.test.mjs`, `tests/web-job-editor.test.mjs`. Existing grazing expectations updated in `tests/find-local-help.test.mjs`.

## Validation

- Full `npm test`: **570 passed; 0 failed**.
- Provider web `npm run build -- --webpack`: passed, including TypeScript.
- Public web `npm run build -- --webpack`: passed, including TypeScript.
- Expo `export --platform all`: Android and iOS passed.
- `git diff --check`: passed.
- Provider build reports an existing named `version` export warning in account/help; build succeeds. Initial sandbox file-access failure and shared import/type issues were resolved before successful builds.

## Manual smoke tests still required

1. On narrow iPhone, Android and web, open grazing booking/quote: check public town and explanation, no requester location/pin controls, submit successfully without address; verify quantity/pricing and Activity link.
2. As provider, inspect request, accept using normal flow. As requester, verify exact listing location appears only when existing disclosure rules permit. Before acceptance check no private street/coordinates appear.
3. Service: missing address blocks submission; autocomplete and Drop pin remain usable; submit with directions and inspect saved booking.
4. Hire: submit collection request without address; separately submit delivery address/pin; verify optional wording and saved fields.
5. Goods/lease: Enquire remains available and location arrangements copy appears; no new booking lifecycle.
6. Cancel/back out before sending and test failed/retried submission; confirm no success shown for failures and existing idempotent submission remains intact.

No physical-device or live-account smoke test was performed. Builds/export validation is not a substitute for those checks.
