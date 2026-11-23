# Provider Job UX Release 2

Branch: `feature/provider-job-ux-2`, based on main `04c5b95`. The separate Home investigation is not merged into this branch.

## Changes by job stage

- Accepted, no arrival: one Confirm your arrival time status, existing header title, requester, agreed offer amount and location. Confirm job is the primary next action and opens the unchanged arrival/payment-method sheet; Chat remains prominent. Completion remains available without a schedule or time gate.
- Scheduled: one Scheduled status and one formatted arrival window in the main summary. Actions are Chat, Navigate, Mark as completed, Update arrival window, delay notice, then calendar and profile. Removed separate Agreed arrangements and Work schedule presentations for these states; their existing handlers remain in use.
- Completed: persistent Completed status and compact requester/price/arrival summary. Review requester is primary until reviewed; Edit requester review and reviewed/received-review information remain available. Payment remains independently editable under its existing acknowledgement rules. Map/profile actions are secondary. Arrival-update/delay actions and stale acceptance messages are absent.
- Job details: collapsed by default, including after completion; category and requested timing form its compact summary. Expansion retains full description without the old four-line cutoff, exact authorized location, map and work area, photos, job and offer materials, access requirements, agreed offer/line items and duration. The title appears once in the page header; repeated Location labels are removed.
- Completion confirmation: requested title/message and Not yet / Complete job labels. Buttons stack at full width to avoid horizontal label truncation. Busy/error/cancel handling and completion mutation are unchanged.

## Design decisions and preserved behavior

Only accepted-provider mobile JobDetail presentations for accepted/completed jobs change. The previous body remains the fallback for cancelled and legacy states, preserving those actions and explanations. Requester Manage Job, Home, Activity, provider web and open-job offering are untouched.

Existing ConfirmJobSheet, ArrivalWindowModal, MarkCompleteSheet, ReviewModal, JobPaymentHandoff, formatArrivalWindow and all navigation/mutation handlers are reused. Payment rendering is shared between the new and fallback bodies with unchanged props, permissions and refresh behavior. Confirmation still collects payment method; payment acknowledgement remains independent from scheduling, completion and reviews. No Start work step, new lifecycle status, database/API/dependency change or migration.

Provider headings are limited to three visible title lines with the full accessible label. Status badges wrap and remain constrained to card width. Chat uses a short visible label while its accessible label identifies the requester. Completion buttons no longer share a narrow row. These changes avoid fixed-height/line-limited supporting text.

## Verification

- Full automated suite: **500 passed, 0 failed**.
- Screen regressions cover accepted/unconfirmed, confirmed/scheduled, saving arrival updates, delay notification, Chat/map/calendar routes, details expansion/collapse, completion cancellation and success before a future arrival, completed-review eligibility/state, persistent payment/attribution, status wrapping and full-width completion buttons.
- Existing payment component tests cover acknowledgement and Undo confirmation, failure, retry and duplicate-submit protection. Existing lifecycle, privacy, review and web tests pass.
- Android and iOS Expo exports pass, including Hermes bundle generation.
- Remaining phone checks: narrow iPhone/Android geometry and large-font labels; physical calendar permissions and launch; native keyboard/date picker behavior; screen-reader order and mapped-area rendering. Fixture/native-boundary tests and exports do not establish physical-device appearance or live backend results.

Unrelated local and uncommitted changes preserved. No merge, push, migration or publication performed.
