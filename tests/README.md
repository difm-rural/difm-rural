# DIFM Rural — E2E Tests

## Off-screen chat notification checks

Run `node --test --test-isolation=none tests/chat-notification-focus.test.mjs`.
Open a chat, return to Activity/Notifications, then have the other participant
send a new message. The message notification must remain unread until that
conversation is opened. The open notification inbox refreshes within 10 seconds
and on foregrounding. Different people enquiring about one listing must not
clear each other's notifications. Past notifications already marked read are
not reset; use a newly sent message to verify the fix.

## Provider-led completion

Run `node --test --test-isolation=none tests/provider-completion.test.mjs`.
Apply `20261014120000_provider_led_completion.sql` before using the updated
completion buttons against the shared database. It enables accepted providers
to complete jobs and bookings directly, preserves quote/cancellation guards,
normalises old-client completion writes, notifies both participants about
reviews, and converts existing awaiting-completion work into completed work.

On a phone, test accepted/in-progress jobs and confirmed/in-progress bookings:
provider Mark complete should move the record directly to History; requester
receives a completion notification and can review without a confirmation step.
Also check that unrelated providers cannot complete work, pending bookings
cannot be completed, repeated completion does not succeed twice, and quotes
and cancellations retain their existing permissions. Test an older app build
if one is still used by testers.

## Help and feedback device checks

From Account, open Help & feedback. How it works should open the explainer;
Send feedback should open an email draft to hello@ruralconnections.nz with
app version, build, platform and update details. With no configured mail app,
check the fallback message and long-press copying of the visible email address
and version details. Send feedback must only open a draft, not send email.

## Lighter onboarding device checks

Setup starts with public name and town/region, followed by optional skills and
completion choices. Check blank-field guidance and typed location when Places
search is unavailable. Confirm the public name appears consistently on jobs,
listings and messages. Skills → Skip for now should reach the choices without
saving edited skills; Finish setup later from the first screen should leave
setup only after the completion save succeeds. Existing phone, bio and
qualifications must remain unchanged. Pending guest actions should still resume.

## Activity messages checks

Run `node --test --test-isolation=none tests/message-threads.test.mjs`.
On a phone, send a listing enquiry, leave Chat and open Activity → Messages
before anyone replies. Reopen the correct listing/person conversation and go
Back to Messages. Repeat with two enquirers on one listing, and with job and
booking chats. Conversations should sort by latest message; pull-to-refresh
should show incoming replies. Offline loads should offer Retry. Check that
Activity's Post a job opens the wizard directly and Active includes requests.

## Marketplace recovery device checks

On guest Home and Listings, check these separately:

- Offline load: connection error with Retry, rather than an empty-marketplace message.
- Empty results with no search: genuine empty state; pull-to-refresh remains available.
- Unmatched search: Clear search, rather than Add a listing. Clearing restores results.
- Search, go offline, retry, then reconnect: the query stays intact throughout recovery.
- Guest Home partial failure: the failed feed offers Retry while successfully loaded content stays available.
- Empty/error screens on a small phone: pull-to-refresh and buttons work with the keyboard open.

## Sign-in regression checks

Run `node --test --test-isolation=none tests/sign-in.test.mjs` for email
validation, code paste handling and actionable failure messages.

On the release build, test an incomplete email, an expired code, full-code
paste into the first and another box, OS autofill, repeated rapid submissions,
and failed resend with the network unavailable. A failed resend must not claim
a code was sent or clear the entered code. Successful sends start a 60-second
cooldown; returning to email entry must not bypass it for the same address.
Confirm fields stay usable with the keyboard on a small phone. Google sign-in
must not be offered.

## Local guest enquiry regression checks

Pricing checks: `node --test --test-isolation=none tests/listing-estimate.test.mjs`.
On a phone, verify a $50/hour listing with a $150 minimum shows a $150 base
estimate for one hour on detail and review, and stores $150 on the request.
Repeat with a rate variant. Delivery extras and terms should be repeated on
review and clearly excluded from the base estimate; payment stays direct.

Run `node --test --test-isolation=none tests/listing-enquiry.test.mjs`.
These checks require installed dependencies but no Supabase credentials. They
cover saved listing/recipient restoration, onboarding readiness, expired or
invalid intents, and Back behaviour using the installed navigation routers.

On the release build, also check a signed-out enquiry on grazing, lease and
for-sale listings: choose Sign in, finish or skip setup, and confirm Chat opens
for the correct listing and person. Back should show that listing, then Listings.
Repeat with an existing account, dismiss the sign-in prompt, and confirm a
signed-in enquiry still opens Chat directly. No message should be sent until
the tester presses Send.

## Setup

Before running tests, create two dedicated test accounts in Supabase Auth:

| Email | Password | Role |
|---|---|---|
| `test.requester@difmrural.test` | `TestPass123!` | requester |
| `test.provider@difmrural.test` | `TestPass123!` | provider |

Set `primary_role` on each profile row after creating the accounts.

The SQL from `src/lib/features_v2.sql` must also have been run against the
project to create the `job_questions`, `notifications`, and new bid columns.

## Run

From the `difm-rural` folder in Command Prompt:

```
node tests/e2e-job-flow.js
```

## What it tests

| Step | Test |
|---|---|
| 1  | Requester login |
| 2  | Post a job with materials + access details |
| 3  | Provider login |
| 4  | Provider views job — checks materials_type, access_conditions, location_note |
| 5  | Provider asks a question (job_questions) |
| 6  | Notification check (warning only — app inserts these client-side) |
| 7  | Requester answers question; provider can read answer |
| 8  | Provider places itemised bid with line_items + available_from |
| 9  | Provider edits bid — verifies updated amount persisted |
| 10 | Requester reads all bids with line item breakdown |
| 11 | Requester accepts bid; other bids rejected; job → accepted |
| 12 | Provider sends chat message |
| 13 | Requester replies; verifies thread count |
| 14 | Provider marks job in_progress (exposes RLS gaps if any) |
| 15 | Requester marks job completed |
| 16 | Verify final job + bid state |
| 17 | Cleanup — delete test job (cascades to bids, messages, questions) |

## Notes

- Step 6 will warn (not fail) if no notification is found. Notifications are
  inserted client-side in the app, not via a DB trigger, so this step only
  passes when the app has already run that path.
- Step 14 tests whether RLS allows a provider to update job status to
  `in_progress`. If your policy restricts this to requesters only, the step
  will fail with a clear error — that is the expected signal to update the
  policy.
- The test cleans up after itself. If cleanup fails (e.g. RLS blocks delete),
  the job ID is printed so you can remove it manually.
# Web Home and connected flows

Web Messages and Notifications:
`node --test --test-isolation=none tests/web-messaging.test.mjs tests/web-messaging-data.test.mjs`
checks domain/participant isolation, sent-thread retrieval, safe attachments,
focus-gated read eligibility, database query scoping and unavailable/offline
conversations. Before release, use two accounts to check:

- Messages contains listing, job and booking threads, including a sent enquiry
  before its first reply. Different enquirers on one listing stay separate.
- A new message updates the inbox and sidebar without manually refreshing.
  Keep the recipient's tab hidden or another conversation open: the new notice
  stays unread until the correct conversation is visible and focused.
- Photos preview before sending, open full size after delivery and remain
  readable in the mobile app. Denied location permission explains what to do;
  successful location sharing previews coordinates before Send.
- A failed send retains text/attachment for retry. Repeating the same send
  attempt must not create duplicate messages. Ended arrangements are read-only.
- All/Unread notification filters, pagination, individual marking and Mark all
  read work. Opening a message notice targets its exact conversation; opening
  a removed target gives a useful error. Mark all read leaves newer notices
  outside the displayed snapshot untouched.
- Check desktop two-pane and phone single-pane layouts, keyboard access,
  incoming-message scrolling and draft retention during live refreshes.

Web Activity: `node --test --test-isolation=none tests/web-activity.test.mjs`
checks participant-specific actions, completion/review eligibility, grazing
close/relist choices and Active/History classification. Before release, use two
accounts to complete a job and booking, withdraw an unaccepted request, confirm
a cancellation, close/relist grazing, and save/edit reviews from History. Check
that an unrelated account cannot perform these actions and that a stale form
reports a changed arrangement rather than a successful update.

`node --test --test-isolation=none tests/web-home.test.mjs` checks booking
estimate rules, conversation notification destinations and request wording.

Before release, test with two signed-in web accounts:

- Home's four action cards open job posting, listing discovery, job discovery
  and listing creation. Counts agree with the same account in the mobile app.
- Post a job through all five steps; Previous retains the draft. An unaccepted
  provider sees only the public area, and the accepted provider can see the
  property location. No job is published before the final Post job action.
- Send an offer, accept it as the requester, and verify the job is awarded and
  competing pending offers are rejected. Repeat acceptance must not award twice.
- Search jobs and listings, clear an unmatched search, and retry a failed load.
- Send a listing enquiry as a visitor to another member's listing. Both parties
  can retrieve it from Messages, including before any reply. Other enquirers on
  the same listing remain separate conversations.
- Send priced and quote-required booking requests. Verify the estimate includes
  minimum charges and extra charges remain separate. Respond in Activity, then
  open the specific booking conversation from a Home notification.
- Check Home, the sidebar and forms at phone and desktop widths. Browser visual
  verification is still required; automated checks do not cover layout or live
  message delivery.

## Web job posting and management

Run `node --test --test-isolation=none tests/web-job-editor.test.mjs`.
Apply `20261019130000_web_job_management.sql` followed by
`20261019140000_web_job_offer_details.sql` before deploying this web version.
Both migrations have been applied to the linked database.

`web-job-management.sql` runs the RPC ownership and lifecycle checks on a
**disposable, empty local PostgreSQL database only**. It creates fixture tables
and roles, loads the real migrations, checks rejection and success paths, and
rolls everything back. Example: `psql -X -f tests/web-job-management.sql`.
Do not run this fixture on the linked application database.

Signed-in browser acceptance checks (desktop and phone widths):

- Post with photos, date range, materials, site access and private property
  location. Verify the review before publishing and the same details in the app.
- Leave the wizard and reopen it in the same tab. Resume or discard the saved
  draft. Failed uploads and saves must retain entered details. No job should be
  published before the final action, and retrying must not create a duplicate.
- Edit an open job with offers; check the warning and saved details. Accepted
  jobs must reject editing. Changing the site clears the old mapped area;
  otherwise existing mapped-area, visibility and recurrence settings remain.
- Repeat a completed/cancelled job. Dates reset, a new job is created, and the
  original offers, conversations, reviews and lifecycle remain unchanged.
- Send/edit an itemised hourly or fixed offer with availability and materials.
  Check the pricing basis and line amounts in both clients. Withdraw a pending
  offer; accepted offers must reject editing and withdrawal.
- Ask and answer a public question. A non-owner must not answer for the owner.
- Cancel through Activity. Delete requires explicit confirmation; open jobs
  with offers and jobs with an engaged provider cannot be deleted directly.
- Share a job, open the link signed out, sign in, and arrive at that job.
- With two accounts, verify hidden address/GPS/location note remain absent for
  unaccepted providers and become visible to the accepted provider. Public
  photos and Q&A must explain that private details should not be included.

Signed-in browser acceptance remains a manual check; unit/build/SQL checks do
not verify image upload UX, email sign-in delivery or browser layout.

## Web listing and booking detail

Run `node --test --test-isolation=none tests/web-booking-detail.test.mjs`.
The `20261019150000_booking_pricing_snapshot.sql` migration has been applied to
the linked database. New web requests save their reviewed rate, selected option,
minimums, extras and terms. Old requests retain their stored amount and clearly
identify live-listing terms instead of presenting them as historical terms.

`tests/booking-pricing-snapshot.sql` verifies immutability in a disposable empty
local PostgreSQL database and rolls all fixtures back. Never run that fixture
against the linked application database.

Manual signed-in checks:

- Open every listing kind; browse all photos, open/close the photo dialog with
  keyboard controls, and check location, availability, materials and payment.
- A $50/hour service with a $150 minimum estimates one hour at $150. Select a
  rate option with different minimums, continue to request review, and verify the
  selected option, adjusted quantity and amount survive submission.
- For grazing, check head capacity, the single-week/month estimate explanation,
  enquiries, booking requests, and complete/close/relist actions.
- For sale/lease listings offer enquiries. Existing requests reopen the actual
  booking record; failed request checks must not invite another request.
- Change a listing's price, terms or extras after requesting it. The booking
  keeps its original reviewed pricing. If pricing changes while reviewing a new
  request, submission asks the requester to review the latest listing.
- Send/update/accept a quote from booking detail. A quote changed on another
  device must reject stale acceptance. Priced requests can be accepted/declined
  from detail; pending requests must not look confirmed.
- Check requester/provider names, membership date, rating and linked comments.
  Test cancellation, completion and reviews from the same detail screen.
- Confirm an arrival window as the provider and check it as the requester.
  Times display in New Zealand time. Check delay updates and invalid intervals.
- Send a request, simulate a lost response and retry. It reopens the same request.
  Test network failures with Retry and entered request/quote fields retained.
- Verify app/web compatibility using an updated app: saved request pricing,
  rather than the current listing, determines whether to confirm or quote.
  Existing installed apps need the next app update for this compatibility fix.

Browser interaction/layout and physical-device checks remain manual; the code
checks create no live booking requests, schedules, messages or notifications.

## Web discovery and connections

Run `node --test --test-isolation=none tests/web-discovery.test.mjs` and the full
unit suite. The `20261019205939_web_connection_invites.sql` migration has been
applied to the linked database. It creates guarded invitation functions; it
does not create jobs, invitations or notifications by itself.

`tests/web-connection-invites.sql` exercises the actual migration and Connections
view in a disposable empty local PostgreSQL database. It checks role ownership,
private defaults, explicit public posting, notification deduplication and
rollback when an invitation fails. Never run this fixture on the linked DB.

Manual signed-in acceptance checks:

- Search Jobs/Listings by title, description, category and visible location.
  Paginate a result set larger than 60 items. Retry offline loads with the same
  query/options; errors must not show empty-marketplace copy.
- Expand Search options, choose distance/nearest sorting and a browsing location.
  Current GPS is retained privately for six hours without editing the profile or
  placing coordinates in the URL. Profile location can be restored explicitly.
  With no location, show guidance instead of fabricated distances.
- Hidden or missing job pins remain unknown and are excluded from radius
  searches. Any distance includes those jobs. Sorting nearest places unknown
  distances last. Live discovery must exclude paused/closed listings and private
  invited jobs; invitations have a separate retrieval screen.
- Save/remove jobs from the board and detail. Check Saved jobs and the app share
  the same records. Closed jobs remain saved; inaccessible jobs have a useful
  unavailable state with a remove action.
- Save a search with Saved only, instant or daily updates; manage it under
  Account → Saved interests. Reopen a stored distance search after changing the
  browsing location: it retains its saved origin. Edit delivery/pause settings,
  resume an automatically paused interest, and remove an interest.
- Saved alerts can match jobs with private pins without exposing those pins;
  their results can differ from a radius-filtered board. Alert digests open the
  saved search; individual job-match notifications open the job.
- Connections include completed work in both roles and merge repeated work with
  the same person. Check public profile/reviews, live listings and shared history.
  Unrelated relationships and private contact details must remain inaccessible.
- Invite a previous provider to an existing open job. Retry: no duplicate invite
  or notification. Closed jobs and unrelated providers must reject invitations.
- Create an invited job from Connections. It defaults to private; choosing the
  public board is explicit. Simulate a failed/lost response and retry: there is
  one job and invitation, or neither if creation fails. Verify the recipient can
  retrieve it from Job invitations and Notifications, view it, send an offer or
  decline the invitation. Invitations do not automatically accept work.

No live invitations, saved alerts, jobs or messages are sent by these automated
checks. Signed-in browser layout and real delivery remain manual checks.

### Web first-time experience
- Sign in with a new test email; paste the emailed code. Confirm setup asks only for public name and town/region. Optional profile details are deferred to Account.
- Try Post a job, Browse listings and Explore the app on separate setup runs. Try Finish setup later; Home should offer a profile reminder when name or region is missing.
- Simulate a failed profile update: setup must stay open with typed values and Retry guidance, without marking completion.
- Open a listing request or a message link while signed out. Sign in and finish or defer setup; confirm the original destination (including variant/quantity or conversation) is retained.
- Try invalid email, expired code, failed resend and rapid repeated submissions. Resend must show a cooldown and only announce success after the request succeeds.
- Test pasted codes and email-code autofill on iOS and Android browsers. These device checks remain manual.
