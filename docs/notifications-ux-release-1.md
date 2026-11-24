# Notifications UX Release 1 — local review

## Scope and baseline

Branch: `feature/notifications-ux-1` in `C:/Users/OEM/difm-rural/.expo/notifications-ux-1`.
Started at approved combined development commit `fd0c6d9d01fb72abce8bdca1826306b0b59e4c0a`, retaining Property Network, Find Local Help, privacy compatibility and booking-location handling. Reused the previously published notification web work (`1a897aa`) as local cherry-pick `6d10353`; one CSS append conflict was resolved by retaining both listing-summary and missing-item styles. Release-specific changes remain local for review. No main merge, push, deployment, publication or remote migration was performed for this task. Unrelated worktrees and root changes are preserved.

## Changes

- Mobile All/Unread tabs with exact server unread count, independent of the 100-row display limit. Filtering happens before limiting. Newest-first rows are grouped into Today, Yesterday and Earlier using the device timezone. Web uses the same three groups in NZ time.
- Existing pull-to-refresh, focus, badge, foreground and periodic refresh paths retained, including refresh from empty states. Failed queries show retry feedback instead of a false empty success. Stale load responses are ignored.
- Compact full-width rows, unread dots, wrapping text and default font scaling retained. Shared semantic icons and event-side tags are reused. Completion events sent to either party use neutral tags.
- Supported stored review/completion/message/offer templates get concise wording and existing NZD formatting. Unknown/older bodies and full arrangement details are preserved rather than inventing missing actor information. Push/email payload storage remains unchanged; this is client display formatting.
- Shared response/navigation hints show where to respond without claiming a historical action is still outstanding. Read state does not drive lifecycle status or hint availability. Informational events receive no invented urgency.
- Web Q&A, offers and reviews link to existing sections; message routes preserve their exact conversation context. Mobile uses existing role-aware JobDetail/ManageTask/ServiceBookingDetail/Chat routes, with the existing question-focus flag where supported. No new destination screen or lifecycle introduced.
- Deleted/inaccessible mobile targets show existing unavailable feedback; transient lookups retain retryability. Message notices remain unread until the conversation acknowledges them. Mark-all uses a cutoff, viewer ownership and unread filter; failures retain unread UI. Web retains its sidebar, refresh, counts, compact row links, pagination and availability shortcuts.

## Provider event coverage

`job_questions_notify_answered` already invokes `notify_question_answered` on a changed non-null answer and targets `new.asker_id`. `bids_notify_status_change` already invokes `notify_bid_status_change`, targets `new.provider_id` for accepted offers and returns immediately for unchanged status. Existing event types and job metadata route the provider to the job; no additional emitter or storage was added.

Local SQL executes the existing trigger function definitions: a question answer and accepted offer produce exactly two notifications for the provider, while repeated unchanged updates create none. This tests generation rather than only checking SQL text.

Mobile Home includes unread provider notices in its existing attention feed; a lifecycle next-action for the same entity takes precedence, and the feed remains capped at five. All events remain in Notifications. Activity and My Work continue using their existing lifecycle definitions and counts. Provider web Home uses its existing unread attention list and the same destination helper. No event count was substituted for an Activity count.

## Schema/API/privacy

No schema, migration, RPC, Edge Function, push infrastructure or external API change. New helpers use the existing notifications table and current-user queries. Existing notification RLS and marketplace permissions are retained. No private location permissions or listing-location migrations changed. Combined local Property Network/listing-privacy SQL checks passed and rolled back.

## Validation

- `npm test`: **585 passed, 0 failed**. Covers inherited combined functionality and focused mobile filtering, full unread counts, refresh, mark-all success/failure, API query ownership/cutoff, load failures, local calendar/DST grouping, role-aware routes, missing/transient targets, shared wording/hints, web row interactions, long text and accessibility scaling.
- Provider web `npm run build -- --webpack`: passed, including TypeScript and page generation. Existing non-blocking Account Help package-version warning remains.
- Public web `npm run build -- --webpack`: passed.
- Android and iOS Expo exports: passed; no upload or publication.
- `tests/support/notification-events.ps1`: passed against existing local PostgreSQL fixture, all DDL/data rolled back.
- `tests/support/combined-development-permissions.ps1`: passed locally, all DDL/data rolled back.
- Whitespace/conflict checks passed. No live account or physical-device tests claimed.

## Limitations and manual smoke checks

The mobile inbox retains its existing 100-row cap per selected filter; the unread count covers all rows. Old events without structured actor/title data retain their stored wording. Native routes do not expose arbitrary question/offer/review anchors: they open the closest existing authorised screen; question focus scrolls where the existing requester-open layout supports it. Old email deep links outside the loaded inbox remain subject to the existing lookup behaviour. Hints are event-based navigation suggestions, not a new task-completion system.

On both Android and iOS, with requester and provider test accounts:
1. Open All/Unread, check count and ordering around local midnight; switch device timezone and test large text/long titles.
2. Pull to refresh populated and empty filters; test offline failure/retry. Open a notice, return and refresh; verify unread count changes on web too. Mark all read, including a newly arriving event after the cutoff.
3. Open messages, Q&A, offers, accepted work, completed work/review options and bookings. Confirm correct account context and that message read state follows loaded chat.
4. As requester, answer a provider question and accept their offer; verify one provider event each, plus existing Home/Activity behaviour. Confirm no duplicate on unchanged updates.
5. Open an old/deleted/inaccessible target; confirm graceful feedback and no private data. Background/back out during a slow lookup and confirm no late navigation.

On web at desktop and narrow mobile widths: verify sidebar, All/Unread totals, date sections, Refresh, compact rows, keyboard/middle-click navigation, hints, mark-read/mark-all feedback, availability quick actions, missing-item pages and the matching Q&A/offer/review anchors. Confirm Property Network provider assignment/job linking and service/grazing booking-location behaviour remain intact.

## Files changed from combined baseline

- `docs/notifications-ux-release-1.md`
- `provider-web/src/app/bookings/[id]/not-found.tsx`
- `provider-web/src/app/bookings/[id]/page.tsx`
- `provider-web/src/app/browse/[id]/not-found.tsx`
- `provider-web/src/app/globals.css`
- `provider-web/src/app/jobs/[id]/not-found.tsx`
- `provider-web/src/app/jobs/[id]/page.tsx`
- `provider-web/src/app/notifications/actions.ts`
- `provider-web/src/app/notifications/page.tsx`
- `provider-web/src/components/missing-item.tsx`
- `provider-web/src/components/notification-action.tsx`
- `provider-web/src/lib/notification-read.ts`
- `provider-web/src/lib/work.ts`
- `shared/marketSide.ts`
- `shared/notificationBody.ts`
- `shared/notificationGroups.test.ts`
- `shared/notificationGroups.ts`
- `shared/notificationHints.ts`
- `shared/notificationIcons.ts`
- `src/lib/notifications.js`
- `src/screens/NotificationsScreen.js`
- `tests/grokbot-release1.test.mjs`
- `tests/notification-actions.test.mjs`
- `tests/notifications-ux.test.mjs`
- `tests/support/notification-events.ps1`
- `tests/web-home.test.mjs`
