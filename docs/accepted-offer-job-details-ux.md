# Accepted Offer Job Details UX

Branch: `feature/accepted-offer-job-details-ux`, based on published main `45b4f79`.

## Implementation

Only requester-owned jobs with status `accepted` receive the new presentation:

- A single status banner reuses jobNextMove, preserving waiting-for-arrival, confirmed and scheduled status. Its detail explicitly identifies provider acceptance. Acceptance success feedback clears after four seconds, with timer cleanup on state change/unmount.
- Your provider shows only the accepted offer, with provider identity, rating/review count, completed-work count (including zero) and agreed amount using the existing price formatter. Chat with Provider is primary; profile access remains adjacent.
- Existing payment component follows provider coordination and agreed arrangements. Props, acknowledgement, Undo confirmation, attribution, refresh and error handling remain unchanged.
- Existing expandable Job details is reused for full summary, description, photos, exact requester address, mapped work area, materials, access and requested timing. Offer specifics move into the expanded information so long offer messages do not precede Chat. Duplicate title/category, raw accepted statuses, duration and location-note repetitions are suppressed for this state.
- Accepted-state provider name/reputation and amount stack vertically and wrap; the header title is capped at three visible lines with the full accessible label.

Open-job ordering, provider-facing views, later lifecycle layouts, lifecycle transitions, acceptance rules, reads and location privacy are preserved. No dependencies, APIs, schemas or migrations changed.

## Verification

- Full automated suite: **490 passed, 0 failed**.
- Screen tests exercise actual acceptance confirmation and provider selection, Chat/profile destinations, agreed amount/reputation, details expansion/collapse, exact address and mapped area, independent arrival/payment states, temporary success feedback, long text wrapping configuration, unchanged accepted-provider view and later requester states.
- Existing mobile payment tests pass for acknowledgement, Undo confirmation/cancellation, duplicate-submit prevention, attribution and retained state/reminder on error and success. The payment component is unchanged.
- Android Expo export passes, including Hermes bundle generation.
- Native screen geometry, keyboard and TalkBack still require physical narrow-Android smoke testing; automated JSX checks and export do not establish device rendering.

Unrelated local changes were preserved. No merge, push, migration or publication performed.
