# Provider Home and Booking Status UX

Branch: `codex/provider-home-booking-status-ux`, based on approved deployed development commit `04af107` (including My listings navigation and 14px Home tile spacing). Local review only.

## Root cause and scope

Two problems were reproduced from the existing implementation:

1. Mobile appended unread notifications to lifecycle attention items. Web excluded some informational event types, but still promoted an old unread `new_booking` event after a booking had left the active set. Deduplicating only against *currently pending* bookings caused a withdrawn request's historical event to become a standalone acceptance item again. Notification history/read state is not a reliable definition of current work.
2. Mobile's badge-refresh callback refreshed notifications only, leaving its previous active-work snapshot in memory. A pending booking could therefore remain actionable after a withdrawal until another full refresh. Concurrent refreshes could also finish out of order.

The smallest fix reuses the existing `bookingNextMove` / `jobNextMove` `needsAction` decisions. There is no new booking lifecycle or active-status list.

## Changes

- Needs attention now contains only current lifecycle actions for the selected Home role. Terminal/withdrawn/declined/completed bookings cannot become acceptance actions through historical unread events. Accepted grazing remains active in On the go, without an acceptance task.
- The shared attention summary uses the full action count before the five-row display limit. Pending provider invitations count toward the work summary. It shows “You're all caught up.” only with a successfully loaded zero-action result; failures show an unavailable message.
- Notification history stays in Notifications. A separate exact unread-count link remains available even when there is nothing actionable. No notification is deleted, marked read or otherwise modified by this change. Home no longer classifies event bodies as tasks.
- Native badge refresh reloads lifecycle data and unread counts together. A response revision guard prevents older loads from restoring stale state.
- Attention cards show the full title/detail and existing next-action label, with wrapping on web and no line-count truncation on mobile. Booking cards open existing booking details; job cards retain existing role-specific routes.
- Grazing details use the requested provider/requester wording. A sanitized public area is prominent; authorized private booking fields remain secondary. Non-grazing location order/copy and all existing location access checks are retained.
- Existing My Work tiles, 14px spacing, listing navigation, booking actions and permission logic remain unchanged.

## Files

- `shared/homeSummary.ts`: attention filtering/count/copy using existing lifecycle flags.
- `shared/bookingLocation.ts`: role-aware detail explanation helper.
- `src/screens/tabs/HomeTabScreen.js`: current actions, independent unread count, refresh and race guard, untruncated rows.
- `src/screens/ServiceBookingDetailScreen.js`: grazing location presentation.
- `provider-web/src/app/page.tsx`: same attention model and exact unread count.
- `provider-web/src/app/activity/booking-details.tsx`: role-aware grazing location presentation.
- `provider-web/src/app/globals.css`: attention-row wrapping.
- `tests/provider-home-booking-status.test.mjs`: lifecycle counts, native refresh/races, rendered mobile/web location/privacy cases.
- `tests/web-dashboard-activity.test.mjs`: rendered pending/terminal booking and historical unread cases.
- `tests/home-polish.test.mjs`: summary assertion follows the shared helper.
- This report.

## Validation

- Full automated suite: 627 passed, zero failed.
- Focused Home and booking suite: 20 passed, zero failed.
- Provider web production build: passed; existing nonblocking account/help package-version warning remains.
- Public web production build: passed, confirming shared-helper compatibility.
- Android and iOS local exports: passed.
- Whitespace checks: passed.

Regression coverage includes pending provider acceptance; withdrawal before response; confirmed/accepted, declined, cancelled and completed bookings; historical unread counts larger than the attention display limit; independent notification counts; quote/cancellation-response actions; unknown loads; stale response races; role-specific wording and sanitized public area; authorized private fields remaining below the public area.

No schema, migration, API, backend lifecycle, notification-delivery or database-permission changes. No remote records were changed during investigation or tests. Property Map and Photo V1 work remain in their original worktrees. No merge, GitHub push, deployment or publication.

## Manual review checklist

1. With requester/provider test accounts, create a grazing request. Provider My Work should show one response task and the full title with Respond.
2. Withdraw before the provider responds. Leave the original notification unread. Refresh/focus Home and verify the task disappears while the unread event/count remains in Notifications.
3. Repeat with acceptance, decline and completion; check that none appears as awaiting acceptance. Confirm active accepted grazing remains in On the go.
4. Check the summary count with multiple actions and invitations, including more than five rows. Test a failed refresh and rapidly overlapping refreshes.
5. Open grazing details under both roles on narrow Android/iPhone and web. Check the exact requested wording, prominent public area and secondary private information only where already authorized. Verify nonparticipants remain blocked by existing permissions.

Physical-device UI and live two-account lifecycle smoke tests remain manual; automated tests render the real screens with native/network fixtures. No live booking or notification was created, withdrawn, read or deleted for this local task.
