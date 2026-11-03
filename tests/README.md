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
- Jobs with hidden or missing pins use their public town area for approximate
  matching when it can be located. Jobs without a usable public area remain
  excluded from radius searches; Any distance includes them. Nearest places unknown
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

### Public website guest browsing
The public-web project serves `/jobs`, `/jobs/[id]`, `/listings` and `/listings/[id]` without authentication. Action links target the confirmed console origin `https://dev.ruralconnections.nz/login?next=…`; the console preserves the action through sign-in and setup. No guest action submits a message, offer or request automatically.
- Browse/search while signed out, including an unmatched phrase, an empty database and a disconnected request. Confirm distinct states and query-preserving Retry.
- Open a paused/closed listing or private/non-open job URL: it must be unavailable publicly. Public job pages exclude exact address, GPS, location notes and property polygons entirely; profile reads use profiles_public.
- From a listing, choose Enquire or Request booking/quote; sign in and finish/defer setup. Confirm the intended conversation or request review opens. From a job, choose Send an offer or Ask a question; confirm the correct job and section opens.
- Test back navigation across ruralconnections.nz and the console, and narrow mobile browsers. No live test messages, offers, bookings or emails were submitted by automated verification.
- Deploy both public-web and provider-web changes. Public-web continues to use its existing Supabase URL and publishable key; no database migration is needed.

### App-style website Home
- Open public-web `/` signed out. Confirm Find rural help, one shared search, Open jobs and Available listings appear immediately, with live cards and no sample items or marketing hero.
- Scroll both card rows using touch and keyboard; open a card and navigate back. View all retains the shared search. Search failures in one section must not hide the successful other section.
- Search for an unmatched word: each section explains no matches and offers Clear search. Refresh and Retry preserve the query.
- Check desktop and narrow browser layouts: the green wordmark, active guest navigation, account links and bottom tabs should remain usable, with scrolling limited to the card rows.
- Sign in or Sign up from the main header/Account: an existing member should reach console Home. New members finish/defer setup then Explore the app to reach Home. Action-specific login from an enquiry, booking or job keeps its original destination.

### Nearby guest discovery
- Home, Jobs and Listings default to a 50 km radius once a location is chosen. Before that, show the explicit nationwide fallback and location controls; do not prompt for GPS automatically.
- Use my location requests browser permission only on click. Permission denial, timeout or unsupported GPS must offer town selection. Find town uses the existing NZ maps proxy; select a returned result to set the centre.
- Verify 10/25/50/100/200 km and All New Zealand, nearest-first order, no-nearby matches, wider distance, search/category/kind combinations and pagination. Home's View all and navigation retain the same cookie preference.
- Guest locations are rounded to two decimal places and stored in a six-hour HttpOnly cookie, never in search URLs or account profiles. Clear location resets the preference. All New Zealand retains the chosen centre for switching back to nearby.
- Distance reads use jobs_public (which masks private pins) and live services only. Only calculated distance is attached to public card rows. Private jobs use public town centres for approximate matching; items with no usable public location remain available under All New Zealand with explanatory copy.

### Mobile nearby browsing
- Guest Landing, guest job feed, signed-in Jobs, legacy job feed and Listings use the same distance choices: 10/25/50/100/200 km and All New Zealand. Default is 50 km, nearest first. Personal job/offer management sections are not filtered.
- Signed-in users start from their own saved profile pin when available. Without a usable centre, show an explicit nationwide fallback and Choose location. GPS is requested only after Use my location; town search is available if permission is denied or GPS times out.
- Change location/radius on one screen and switch tabs; the choice should persist for six hours. Choices are scoped per member (and separately for guests), rounded to two decimal places, and never update profile fields. Verify logout and sign-in with a different account do not reuse the prior member's browsing preference.
- Test nearby zero results, All New Zealand, search/category combinations, private or missing pins, and current versus legacy listing coordinate fields. Nearby filters exclude unlocated pins with explanatory text; nationwide browsing includes them.
- Check town lookup, denied permission, GPS timeout, storage failure/retry, keyboard visibility and scrolling on both physical iOS and Android phones. Local bundle exports validate compilation, not these device interactions.

### Mobile listing address search
- Edit a listing and type at least three characters in Location. Choose an inline address suggestion with the keyboard open; verify Next waits for the map lookup to finish.
- Save and reopen: the selected location and map pin should remain. Editing other fields must preserve an existing current or legacy pin. Selecting a different address updates both coordinate formats; typing location text without selecting a suggestion clears the prior pin.
- Test a failed suggestion request, failed details lookup and rapid typing. Show helpful fallback copy and keep manual location entry available; stale suggestions must not replace newer results.
- Listing locations are public. Choose a town instead of an exact address if appropriate, and check that the saved listing appears in nearby discovery.

### Console setup navigation and save clarity
- Sign in with onboarding incomplete and open `/setup`. Confirm the normal console sidebar and red shed branding appear, with profile fields before the optional Jobs/Listings explanation.
- Save profile and continue must save public name + town/region and return to Home or the original enquiry/booking destination. Save and post a job / Save and browse listings must save before opening those flows.
- Finish setup later is a full-width-readable button, bypasses required fields, and explains that edits are unsaved. Choosing a sidebar destination likewise defers setup and reaches that destination without a redirect loop.
- Simulate a failed profile update from both the main save and sidebar navigation: stay on setup, retain typed details, show Retry guidance and leave onboarding incomplete. Verify no other member's profile can be updated.

### Private jobs in nearby discovery
- Regression: a public/open job with `hide_exact_location=true`, masked coordinates and public area Waitoki 0871 must appear within 50 km of Kaukapakapa after resolving the public town centre.
- The shared resolver may use only `location_area` for fallback lookup. It must never use a hidden street address, location note, polygon or base-table job coordinates. Preserve masked `latitude` / `longitude`; keep separate `discovery_*` town-centre metadata and label the distance as a town-area estimate.
- Verify mobile guest/signed-in feeds, public website and console return the same nearby result. Existing public exact pins take precedence. Jobs without a usable public area remain unlocated and available under All New Zealand.
- Town lookups are deduplicated and cached for 24 hours, with at most four simultaneous lookups; failed requests can be retried. No job/profile records are updated by discovery.


### Posting dates (jobs and listings)

New or changed dates must be today or later in `Pacific/Auckland`. Today is allowed;
range ends must be on or after the start. Existing historical dates may remain when
editing unrelated details, and Available now / ASAP / Flexible remain supported.
Mobile review and guest-draft publishing recheck dates; mobile date serialisation
preserves the NZ calendar day instead of taking the UTC date prefix.

Run `node --test tests/posting-dates.test.mjs tests/web-job-editor.test.mjs`.
The additional SQL regression test must run only in a disposable PostgreSQL database:
`psql -v ON_ERROR_STOP=1 -f tests/posting-dates.sql`. It creates fixture tables, applies
the migration, checks rejected/accepted writes, and rolls back all changes.
Deploy `20261103090000_validate_posting_dates.sql` for database enforcement; web and
mobile UI checks alone cannot protect older clients or direct API writes.


### Posting currency (jobs and listings)

Fixed job budgets must be positive; primary listing rates may be zero. All posted
currency fields use the existing $10,000,000 ceiling and at most two decimal places.
Extras, minimum charges and alternate rates are checked as well. Neither form
silently rounds malformed values. Both step progression and final publishing validate.
Run `node --test tests/posting-money.test.mjs tests/web-job-editor.test.mjs`.
For database enforcement deploy `20261103091000_validate_posting_amounts.sql`.
The SQL regression test is disposable-database only:
`psql -v ON_ERROR_STOP=1 -f tests/posting-money.sql`.
No historical prices are rewritten; unchanged pricing does not block unrelated
status updates, but new/changed prices must satisfy the limits.


### Listing travel range

Optional; when entered, a whole number from 0 to 2,000 km. Both app and web block
invalid values at the location step and at publishing, without `parseFloat`
truncation or silently replacing invalid input with null. Run
`node --test tests/travel-range.test.mjs`. Deploy
`20261103092000_validate_listing_travel_range.sql` for database enforcement.
Run `tests/travel-range.sql` only in a disposable database. Historical records
are not rewritten; unchanged travel range does not block unrelated updates.


### Publish/save feedback and repeat taps

Jobs and listings on web and mobile share a synchronous submission lock. Busy
feedback starts before authentication, location checks or network writes, stays
active through successful navigation/confirmation, and releases on errors or
cancelled checks so drafts remain editable. Web listings also show photo-upload
and navigation phases. Run `node --test tests/submission.test.mjs`.
Manual regression: with a slow connection, tap Publish/Save twice quickly;
confirm immediate feedback, one request, disabled action during navigation, and
an actionable error plus enabled retry after a failed request.


### Navigation/loading feedback

Internal console page links retain Next.js prefetch/link behaviour and immediately
show a loading panel while preserving the sidebar/mobile navigation. Direct loads
use the same shell; login uses its own branded loading card. Hash jumps, same-page
links, modifier clicks, downloads and external URLs keep normal browser behaviour.
Slow loads offer Try again. Route completion, redirects and error pages settle the
indicator. Mobile Home/Account retain a labelled header during initial data loads.
Run `node --test tests/navigation-feedback.test.mjs`.
Browser regression: click an uncached slow destination, open it directly, use a
hash link and browser Back, and confirm navigation remains visible and loading
clears when the next page or error arrives. Test with authenticated navigation as
well before release; local UI fixtures must never be shipped.


### View your own listing

My listings cards have a clickable photo/title and an explicit View listing action
on app and web. Web `/listings/[id]` uses the same authorised detail component as
`/browse/[id]`, including owners' paused/closed previews and existing non-owner
visibility restrictions. Owners return to My listings; management buttons remain
separate from the view link. Run `node --test tests/own-listing-view.test.mjs`.
Manual: view a live, paused and closed own listing, return to My listings, then
confirm other users still cannot view paused/closed listings.


### Listing wizard network interruption / generic error screen

Wizard step changes are local state updates. New/edit job and listing pages keep
notification badge polling but opt out of automatic RSC page refreshes while the
form is open. This avoids a background refresh interrupting unsaved edits. Other
screens retain live page refresh. Global errors offer Retry and Home, not a Sign
in button for users who may already be signed in; actual expiry is handled by the
auth guard. The reported intermittent ERR_CONNECTION_CLOSED was not reproduced,
so this is interruption hardening rather than a confirmed network root-cause fix.
Run `node --test tests/listing-wizard.test.mjs tests/web-alerts-refresh.test.mjs`.

### Notification action navigation (#8)

`notification-actions.test.mjs` exercises delayed web action results and mobile
lookups: staying opens once, while Back/leaving prevents a late destination.
Web actions return an authorised destination instead of a server redirect;
read updates already sent can finish after leaving. Immediate pending labels
and duplicate-submit locks replace ambiguous Saving feedback. Mobile lookups
cancel on blur and row taps have a busy state. Phone/browser integration
testing with signed-in accounts remains manual; no live notifications sent.

### Field-specific posting feedback (#9)

Job and listing wizards now associate inline messages with each invalid control
using aria-invalid and aria-describedby, focus the first error on web, and clear
corrected field highlights as the user types. Previously reached web steps are
clickable; final submission validates every required step again. Listing advanced
pricing errors identify individual extra-charge and alternate-rate rows.

`job-form-feedback.test.mjs` and `listing-wizard.test.mjs` exercise missing fields,
dates, clearing corrected fields and revisiting steps without database writes.
Mobile job/listing forms show explicit missing-field feedback on Next and allow
returning to earlier steps. Phone keyboard/screen-reader checks remain manual.

### Empty job draft recovery (#10)

The web job form saves only changes from its starting values. Empty legacy
records, whitespace-only fields, unchanged edit/repeat seeds and malformed
records do not trigger a resume prompt. Real edits (including clearing seeded
content or changing privacy/timing) remain recoverable. Discarding or reverting
to the starting values removes the tab-local draft rather than recreating it.

`job-draft.test.mjs` covers draft classification; `job-form-feedback.test.mjs`
executes the actual form effects with simulated session storage to check first
visit, revisit, enabled fields, Resume and Discard. Mobile uses in-memory
PostJobContext with no resume prompt, so no mobile behavior change is needed.

### Posting text lengths (#11)

Shared limits are 160 characters for titles and 2,000 for descriptions, for jobs
and listings on mobile and web. Controls show counters and maximum lengths;
step/final checks also reject overlong AI/restored drafts without truncation.
Pending guest job submissions and web job server input validate lengths too.
Migration 20261103093000 enforces lengths on INSERT/changed text in both tables,
while permitting unrelated updates to historical rows. It is not applied live.
`posting-text.test.mjs`, the form harness tests and disposable-database
`posting-text.sql` verify limits and preserved historical content.

### Public area formatting (#12)

`shared/publicArea.ts` accepts place-name letters (including Māori macrons),
numbers and normal regional punctuation, and rejects markup, emoji, double
quotes and internal control characters. It validates rather than silently
rewriting names. This is a format check, not proof of a real or nearby town.
Web shows an inline area error; server posting validates independently. Mobile
checks its derived public area at Location, final review and guest handoff,
while retaining the existing option to skip location entirely. No existing
records are rewritten and no database migration is needed for this copy rule.
Tests cover accepted names, bad text, web step blocking and server enforcement.

### Match alert distance snapshots (#13)

Home renders match-notification text, which formerly embedded a rounded distance
from the saved profile to the exact job pin when matched. Jobs calculates a
current browsing distance and may use a public town centre for private jobs.
Those values can legitimately differ; this is not a rounding-only discrepancy.
Shared notificationBody removes legacy match snapshot distances from Home and
Notifications on mobile/web. Migration 20261103094000 omits the snapshot in new
instant match bodies/metadata, without rewriting existing notifications.
The specific tester record has not been inspected; this is the confirmed code
path that can produce the reported discrepancy. Current Jobs distances remain
labelled About/town area. No need to send the requested screenshot unless the
discrepancy appears somewhere other than a match notification.

### NZ date and money display (#14)

`shared/formatting.js` is used by mobile, console and public-site cards, details,
reviews, booking summaries, offers, listing rates and extra charges. Dates show
1 Dec 2026; date-only values retain their day and timestamps use Auckland time.
Money uses thousands separators, no NZD suffix, and two decimal places when
cents are present. Numeric input/storage/calculations remain unformatted.
Relative times and Member since month/year summaries remain concise.
Web DateInput preserves the native calendar picker and echoes the selected date
in unambiguous NZ words. Native picker order still follows browser/OS regional
settings; the input value remains ISO for validation/submission.

### Public name save feedback (#15)

Web profile names are controlled and validated before submission. Empty or
whitespace-only names show an inline associated error and focus the name field;
valid input retains its value after server failures. General server errors are
shown at the top and focused. The ordinary hint uses neutral wording and stale
results clear when fields change. Server validation uses the same shared name
rule. Mobile Account and legacy Profile editors show inline name errors, keep
the modal open and save trimmed full_name/display_name together.
`profile-name.test.mjs` tests the actual web form and both mobile save functions
without changing live profiles.

### Saved-item naming and route aliases (#17)

Account, Jobs, management screens and save confirmations use Saved searches &
alerts for searches/follows/alert settings; individual bookmarks use Saved jobs.
Mobile mirrors the display wording; technical identifiers and persisted data
are unchanged. Next config redirects /saved-searches to /account/interests and
/saved-jobs to /jobs/saved. Local HTTP checks returned 307 and confirmed query
strings are preserved. Destination pages retain their existing auth checks.

### Listing card presentation (#18)

Shared listingCardCopy suppresses headline/supporting overlays that duplicate a
title or description while retaining distinct custom copy. Both native card
styles use this rule; mobile titles explicitly use tail ellipses and reserve
two lines. Console/public cards reserve title/description space, use line clamps
and normal word wrapping, and stretch within each row. Console discovery cards
now include the listing description. Full content remains available on detail
pages; uploaded photographs are not edited.
Render/unit tests check overlay deduplication and retained taglines. A temporary
local development fixture was visually checked in the browser with short and
long cards; rows aligned and ellipses rendered. Fixture/tab removed afterwards.
Actual phone layout and text baked into uploaded photos require manual review.

### Console desktop and zoom layout (#19)

Console work pages use available width up to 1,280 px; their forms no longer
inherit the old 620 px cap. Sidebar is sticky, viewport-height and independently
scrollable. At 1,024 CSS px or less it becomes the compact menu/tab layout; the
expanded menu can scroll on short/zoomed viewports. Button/link labels are
centred, redundant detail-header spacing is removed, and a lone job photo stays
a compact thumbnail instead of expanding across the entire detail card.

A temporary local AppShell fixture (no authentication or live writes) was checked
at 1280x800 and 640x400 CSS px. Desktop form measured 932 px with no horizontal
overflow; sidebar top stayed 0 after scrolling 1,565 px. At 640 px, Menu/tabs
appeared and expanded navigation scrolled to Account. This checks the layout
equivalent of 200% zoom on a 1280-wide window, not literal browser zoom controls.
Fixture removed and viewport reset afterwards.

### Listing and discovery copy (#20)

Listing types use Service/Grazing/Hire/Lease/For sale on both platforms. Photo
instructions say Add up to 4 photos; main wizard steps use Next, Review listing,
then Publish listing (Save changes for edits). Duplicate pricing headings were
removed, pricing choices say Pricing type and Quote required, browsing-origin
labels form grammatical sentences, and management is titled My listings rather
than Provider console. Materials copy is shown only for service listings.

Zero base rates are intentionally supported by the existing pricing rules.
Forms now explain them, and rate displays say Free, or Minimum $… when a positive
minimum charge exists. Extra charges remain separately disclosed. Shared display
and booking-payment tests cover free/quote/minimum distinctions and service-only
materials wording. No validation or database pricing policy was changed.

### Listing control names (#21)

Listing management actions now have visible Edit/Delete text, listing-specific
accessible names, and decorative SVGs hidden from assistive technology. Sign out
has visible text as well as its existing accessible name. Mobile View/Edit/Delete
labels identify the target listing. Browser AX inspection of live, paused and
closed fixture cards confirmed named controls and Sign out; no business action
was clicked. The temporary local fixture/tab were removed. The old empty-name
report was not reproduced: generic Edit/Delete/Sign out labels already existed
in current source. Actual screen-reader/device testing remains manual.

### Job Maps and saved timing (#22)

jobMapTarget requires a usable visible pin and distinguishes address-shaped
property locations from town-only text. Town-only/masked records do not receive
a property-navigation action. Pins without an address, plus codes and mapped
areas retain a pin-specific label; this is not address-existence verification.
The helper is shared by web job detail and mobile navigation/thumbnail actions.

Web timing now uses the actual named select while that step is visible and a
single hidden value on later steps. Editor initialisation normalises saved type
case/whitespace, infers Specific/Range only when the legacy type is absent, and
shows unsupported saved choices for review instead of defaulting to Flexible.
Mobile edit initialisation uses the same rule and retains saved range choices.
Browser verification of a local specific-date fixture confirmed option, date
and Next/Previous preservation. Fixture removed. Original tester record was not
identified, so its mismatch was not reproduced or attributed conclusively.

### Stable email-step action (#23)

Web and mobile use Continue throughout email entry instead of relabelling the
button when the review address is detected. Shared method hints explain email
codes for ordinary accounts and the password step for the review account.
Web cooldown feedback is separate from the stable action label. Password and
verification stages retain their action-specific Sign in / Verify labels.
The component regression test verifies a stable button while typing either
address, accessible hint association and a password handoff without an OTP call.
Existing mocked-auth tests still verify ordinary OTP and review password login;
no live sign-in requests or credential changes were made.
