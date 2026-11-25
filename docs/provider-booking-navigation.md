# Provider booking navigation consistency

Branch: `codex/provider-booking-navigation`, based on deployed development release `2438262`. Local review only.

## Route trace and root cause

| Entry point | Route |
|---|---|
| Home → My Work → Needs attention booking | `openAttentionItem` → `ServiceBookingDetail`, with the existing booking and provider role |
| Home → My Work → On the go booking | Same `openAttentionItem` handler → `ServiceBookingDetail` |
| Home → My Work → Active work count | Parent `Activity` tab → `ActivityMain` with `homeFocus: 'work'` → filtered provider work list |

Active work opens the existing Activity list, not another booking-detail screen. Its booking cards previously included a quick Confirm control. That control immediately called the existing acceptance API for a pending non-quote request. The full mobile details screen also had an immediate Confirm action. Neither control explained the distinction between opening/reviewing a request and accepting it through a separate confirmation step. The summary navigation itself did not submit a booking; the alternate card's mutation control created the accidental-acceptance risk.

Provider web already links Activity booking titles and “View details & actions” to `/bookings/:id`, using the existing detail page. Its acceptance form says “Accept booking request” and explains that submission confirms the request. No web source change was required.

## Implementation

- Keep the existing Active work filtered Activity route.
- Focused provider booking lists are full-width vertical lists with a “View booking details” control. Focused cards do not expose quick acceptance, decline, completion or other mutation controls. Their card tap and details control both navigate to the same existing `ServiceBookingDetail` screen used by Home.
- The ordinary Activity pending-booking shortcut says “Review request” and opens details. Remove its direct booking-acceptance API path. Other ordinary Activity management actions retain their existing behavior.
- Mobile details label the provider action “Accept booking request”. Its full-width position keeps the longer wording readable on narrow screens, with Chat/Decline beneath it.
- The action opens an “Accept booking request?” dialog explaining that acceptance confirms the booking and that timing, access and payment are arranged in Chat. “Not now” dismisses without a mutation. Only the explicit “Accept booking request” confirmation calls the existing update with its pending-state guard.
- Existing lifecycle transitions, quote flow, permissions, privacy, data and backend logic remain unchanged.

## Files

- `src/screens/tabs/ActivityTabScreen.js`
- `src/screens/ServiceBookingDetailScreen.js`
- `tests/provider-booking-navigation.test.mjs`
- This report.

## Validation

- Full automated suite: 634 passed, zero failed.
- New focused suite: seven passed, zero failed.
- Provider web production build: passed; existing nonblocking account/help package-version warning remains.
- Android and iOS local exports: passed.
- Whitespace checks: passed.

Tests execute the real mobile screen/card handlers with native/network fixtures. They verify the Home attention/On the go destinations, the Active work route and its details-only list, navigation without writes, normal Activity review navigation, pending/confirmed grazing cards without mutation controls in the focused view, explicit acceptance confirmation and the unchanged pending-state guard. They also verify acceptance is absent for requesters, already-confirmed bookings and quote-required requests, and confirm the existing web details routes and explicit acceptance copy.

## Manual review

On narrow Android and iPhone devices, open the same pending grazing request through all three entry points. From Active work, tap the card or View booking details. Check that the same full detail UI opens and the booking stays pending. Tap Accept booking request, dismiss with Not now, and verify no change. Then deliberately accept through the second confirmation and verify the normal lifecycle result. Confirm Chat, Decline and quote-required requests retain their behavior. Physical-device and live two-account acceptance checks remain manual; automated tests and local exports do not replace them.

No migration or backend changes. No remote records modified, main merge, GitHub push, deployment or publication. Unrelated Property Map and Photo V1 work is preserved in its original worktrees.
