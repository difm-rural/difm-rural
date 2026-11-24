# Notifications final refinements — local review

Branch: `feature/notifications-final-refinements`, based on deployed Notifications UX Release 1 commit `d050f479450e11c8764f596cd36999a9e87b9660`. Includes the approved combined Property Network, Find Local Help and booking-location baseline. No main merge, push, deployment, publication or remote migration.

Changes:
- Shared event-specific labels replace generic ownership labels in mobile/web notifications and their Home notification rows. Marketplace colours keep the existing job/listing distinction. Other existing events have specific labels (payment, availability, saved search, invitation, arrival update); unknown events use UPDATE. Event types remain unchanged.
- Known arrangement-confirmation templates show the provider's first name, exact job title and a concise summary. The original body/metadata and destination details remain intact. Unknown templates retain their original text.
- A separate small secondary line shows an explicit valid agreed timestamp in NZ date formatting/local time. Web defaults to Pacific/Auckland; mobile uses the device timezone for offset-bearing timestamps. Known legacy NZ wall-clock strings are shown separately with an explicit NZ time label, preserving their year only when stored. Missing years are never inferred. Invalid/unrecognised dates produce no fabricated agreed time, and notification creation time is never used as arrival time.
- Mobile All/Unread uses a compact segmented surface with equal-width tabs, filled selected state, accurate existing unread count, 44px minimum touch targets and screen-reader selected state. Today/Yesterday/Earlier grouping, retrieval, refresh and read-state logic are unchanged. Arrangement time is included in the row accessibility label.
- Reply in chat and View review options remain text within the existing whole-row action. Existing chat targets retain sender/job/booking/listing context. Web completion rows open #reviews on the correct job/booking; native completion rows open existing authorised JobDetail/ManageTask/ServiceBookingDetail screens with their existing review controls. No duplicate workflow or route was introduced.

Validation:
- Full npm test: **592 passed, 0 failed**.
- Focused coverage includes event labels, non-mutating summary formatting, explicit and legacy agreed times, NZ summer/winter offsets, invalid dates, mobile selected presentation, accurate counts/filtering, read-state success/failure and existing event destinations. Mobile/web use the same tested display helpers.
- Provider web build with webpack and TypeScript: passed (existing non-blocking Account Help package-version warning).
- Public web build with webpack and TypeScript: passed.
- Android and iOS local exports: passed; no uploads.
- Whitespace/conflict review passed. No database, notification delivery, API, permission, lifecycle, push or rc-mcp change.

Limitations / manual review:
- Old events only contain a readable NZ time and an ID, not a timestamp with offset/year. These are labelled NZ time and never guessed or converted into an invented instant. Unrecognised old formats keep their full body and rely on the destination for full arrangements.
- No live-account or physical-device testing was performed for this local follow-up. On Android/iOS, check long titles, large fonts, selected tab contrast/counts, refresh/read state and local dates; tap Reply in chat and View review options for requester/provider jobs/bookings. On narrow/desktop web, check labels, secondary time and those same destinations. Existing review/acceptance permissions still decide available actions.

Files changed:
- `docs/notifications-final-refinements.md`
- `provider-web/src/app/globals.css`
- `provider-web/src/app/notifications/page.tsx`
- `provider-web/src/components/notification-action.tsx`
- `shared/marketSide.ts`
- `shared/notificationArrangement.ts`
- `shared/notificationBody.ts`
- `src/screens/NotificationsScreen.js`
- `src/screens/tabs/HomeTabScreen.js`
- `tests/notification-actions.test.mjs`
- `tests/notification-final-refinements.test.mjs`
- `tests/notifications-ux.test.mjs`
