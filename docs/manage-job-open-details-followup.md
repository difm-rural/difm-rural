# Manage Job UX Release 1 follow-up

Branch: `feature/manage-job-open-details` (based on published main `a3a604e`).

## Implementation

Only the owner of an open job receives the new order on JobDetail:

1. Unanswered Questions & Answers immediately below the existing job-title header.
2. Existing offers, including provider profile, price and acceptance control.
3. One collapsed Job details disclosure containing the existing general details, description, photos, map, requester location, materials, access and requested timing. Answered questions remain available inside this section.

The existing question-card renderer, reply input, post-answer handler, offer cards and acceptance confirmation are reused. The owner no longer sees a second job title in the expanded details card. Providers and later lifecycle states keep their existing ordering and expanded information.

Manage Job passes `focusQuestions: true` from Waiting on you. On entry or return, JobDetail waits for owner identity and unanswered questions, then scrolls to the first unanswered question at the top of the scroll content. Answering a question does not trigger another automatic scroll. Answer this question is a filled button with a minimum touch target and an accessible question-specific label; it still opens the existing inline reply interface.

Manage Job More actions now has a down/up chevron synchronized with its existing expanded state. The collapsed details summary uses an explicit Unicode middle-dot escape, correcting the malformed separator without re-encoding unrelated content.

## Verification

- `npm test`: **485 passed, 0 failed**, including 12 new JobDetail tests and one additional Manage Job polish test.
- Real JobDetail screen JSX and effects are exercised with native/network boundaries stubbed. Tests cover loaded question focus and return navigation, unanswered/answered ordering, multiple offers and confirmation, successful acceptance while questions are unanswered, opening and posting a reply to the selected question, details expand/collapse, exact requester location and map navigation, hidden-location provider behavior, empty and answered-only states, later requester lifecycle layouts and long mobile content.
- Manage Job tests also verify the navigation focus flag, changing chevron and rendered middle-dot separator.
- `npx expo export --platform android --output-dir dist/manage-job-followup-android`: passed, including Hermes bundle generation.
- Native geometry, physical-device keyboard behavior and TalkBack require device smoke testing; these are not claimed by the JSX tests or export check.

## Scope and release status

No API, database, dependency, acceptance-rule, permission, notification or location-privacy changes. Existing job reads still use jobs_public. No migrations required.

No merge, push or publication performed. Existing unrelated working-tree changes are preserved.
