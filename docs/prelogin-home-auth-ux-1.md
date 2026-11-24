# Pre-login Home and sign-in UX — Release 1

Local feature branch: `feature/prelogin-home-auth-ux-1`.

Based on current GitHub main `a389109`, plus approved listing-management navigation `03ffd07` and Home spacing `7817416`. Property Map validation and uncommitted Photo V1 work remain in their original worktrees.

## Changes

- Mobile and public web introduce “Get jobs done. Find work.” with equal-weight, fully tappable Find help and Find work cards using existing public listings/jobs routes.
- Existing public previews, cards, location selectors, distance filtering and public-view queries remain. Section headings offer See all. Existing unified search is reused with “Search jobs, services and equipment...” wording. No geolocation is requested automatically.
- Mobile introduction now scrolls with the content on small screens. Existing guest bottom navigation is retained.
- Mobile and provider web use “Sign in or join”, “Enter your email to access Rural Connections.” and “New here? We'll help you create an account.” Repeated email instructions and their empty placeholders are removed. Email-code account creation, password exceptions, validation, cooldowns and biometrics are preserved.
- Guests receive an explanation before member actions. Mobile stores a one-hour, allowlisted return intent containing an action and public UUID only. Public records are reloaded from the existing public views after authentication and optional onboarding. Cancellation clears the intent; malformed/expired destinations are ignored. Web reuses its existing guarded return path, with additional encoded-delimiter/auth-loop validation.
- Signing in no longer automatically inserts a guest job or booking. Posting opens the existing form; a fresh saved guest job draft returns to review with dates/details intact. Booking opens its existing form. Offers, enquiries and favourites return to their existing context without automatically submitting or saving anything.
- Existing signed-in Home, booking submission/lifecycle, Property Network linking, listing management and ownership checks are unchanged.

## Files changed

Mobile:

- `src/screens/LandingScreen.js`
- `src/screens/LoginScreen.js`
- `src/screens/GuestJobDetailScreen.js`
- `src/screens/GuestJobFeedScreen.js`
- `src/screens/ServiceDetailScreen.js`
- `src/screens/BookingConfirmScreen.js`
- `src/screens/postjob/PostJobStep1JobType.js`
- `src/screens/postjob/PostJobStep5Review.js`
- `src/screens/tabs/BrowseTabScreen.js`
- `src/components/JobServiceCard.js`
- `src/navigation/AppNavigator.js`
- `src/lib/guestIntent.js`

Web and shared copy:

- `public-web/src/app/page.tsx`
- `public-web/src/app/globals.css`
- `public-web/src/components/marketplace-shell.tsx`
- `provider-web/src/app/login/page.tsx`
- `provider-web/src/app/login/login-form.tsx`
- `provider-web/src/lib/return-path.ts`
- `shared/reviewAccount.ts`

Tests and documentation:

- `tests/prelogin-auth-ux.test.mjs`
- `tests/find-local-help.test.mjs` (replaces obsolete automatic-booking expectations)
- `tests/grokbot-release1.test.mjs` (updated empty-email wording expectation)
- `tests/support/booking-confirm-screen.mjs`
- `tests/support/post-job-wizard.mjs`
- This report.

## Backend and privacy

No schema, migration, API, backend deployment or authentication architecture changes. Public discovery and return lookups use the existing database-enforced `jobs_public` and `services_public` views. No private address, exact provider pin, token or conversation is added to redirect parameters. Existing member actions continue using existing backend authorization. Existing listing-enquiry routing is reused.

Old on-device guest drafts are not automatically sent or deleted. New draft snapshots can be restored for one hour; older-format drafts without a restorable snapshot require restarting the action. Booking option/quantity choices can be selected again after authentication; no request is sent until explicitly confirmed.

## Validation

- Full `npm test`: 611 passed, zero failed.
- Focused pre-login/authentication suite: 14 passed, including real mobile form/draft harnesses, public-view-only return reads, no automatic submissions, expiry, malformed intents and unsafe web redirects.
- Provider web production build: passed, with the existing nonblocking account/help package-version warning.
- Public web production build: passed.
- Android and iOS exports: passed.
- Local production-browser Home checks at 320, 360, 375, 390, 430 and 1280px: equal card dimensions, no horizontal page overflow, existing routes, one search and no automatic geolocation request.
- Local public job/listing details and their authentication handoff links, search submission, location-control rendering, sign-in copy and unsafe return fallback checked without authentication or marketplace writes.

Live email-code/biometric authentication and installed Android/iOS execution were not performed. Local HTTP location checks confirmed control availability and cookie creation; secure-cookie persistence should be verified on HTTPS during the manual smoke check.

## Manual smoke checklist — Android, iOS and web

1. Signed out, open Home at narrow widths. Check both cards, wrapping, tap targets, previews, See all and existing bottom navigation.
2. Browse listings and jobs, open public details, search, choose a town and change distance. Check public area/approximate distance only; no private street/pin. Confirm no automatic device-location prompt.
3. Try Post, create listing, offer, enquiry, booking and save. Check the sign-in explanation, then cancel and confirm browsing context is retained and nothing was submitted.
4. Sign in with an existing account and complete/defer setup with a new account. Confirm return to the selected action or safe starting page and require an explicit final submission. Check chat recipient and job/listing identity.
5. Exercise an expired session/intent and unsafe `next` values. Check safe fallback, cooldowns, existing OTP/password exceptions and optional biometrics.
6. Signed in, confirm My Property/My Work, listing management, ordinary job posting, Property Network linking and booking workflows remain operational.

No merge, push, deployment, publication or migration was performed.
