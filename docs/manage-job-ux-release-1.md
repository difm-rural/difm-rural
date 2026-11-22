# Manage Job UX Release 1

Branch: `feature/manage-job-ux-1`, based on freshly fetched `origin/main` (no divergence).

## Changes by state

- Open, no offers: one Waiting for offers banner; compact listing metrics include offers, provider views and alert-ready matches. Existing metric fetching/calculation and suggestion selection are unchanged. Photo, budget and previous-provider suggestions retain their existing destinations. Empty offers copy is inline, with a fallback when performance is unavailable.
- Open, offers: individual offers move above supporting information, keeping provider, amount, profile link and acceptance control together. Multiple offers keep their existing order and confirmation.
- Questions: Waiting on you is tappable and opens the existing JobDetail Questions workflow. Acceptance remains independent.
- Requester, accepted: remove repeated waiting card and job overview, retain one status banner, assigned provider, agreed price and estimated duration. Chat precedes payment. Existing arrival calendar/running-late controls remain available when scheduled.
- Open and requester accepted: consolidated expandable Job details includes category, exact requester location, budget, agreed price, posted date, description, location note and schedule. Open Edit and Share move near the top. Cancel and Delete retain existing rules and dialogs in More actions.

## Preserved behavior

No dependency, database, API, notification, payment-processing, permission or lifecycle changes. Payment reminder, acknowledgement attribution and Undo remain in the existing payment component. Provider acceptance and job editing handlers remain unchanged. Later lifecycle layouts retain their original content. Unrelated existing local files are excluded from this change.

## Verification

- Full automated suite: 472 passed, 0 failed (466 existing plus 6 focused screen tests).
- Focused tests render real screen JSX with native/network boundaries stubbed; cover no offers, multiple offers and acceptance confirmation, unanswered questions without blocking acceptance, expand/collapse, edit/share/cancel/delete availability, accepted coordination with both payment states, chat navigation, and completed review availability. Existing suite covers lifecycle rules and edit/Cancel navigation.
- Android Expo export succeeds, including Hermes bundle generation.
- Long title and provider-name fixtures exercise rendering; header caps visible title at three lines and exposes full accessible title; provider text retains flexible space. These tests do not measure native geometry.
- Physical narrow Android layout, TalkBack and live Supabase end-to-end validation remain manual follow-up; no device verification is claimed.

## Deferred review

Later lifecycle screens still repeat overview/details and status content; intentionally retained per scope. Questions continue to open the existing JobDetail workflow rather than introducing a new route or workflow. This release does not change stale route bid-count handling or existing action availability logic.

No merge, push, migrations or publication performed.
