# Grok Bot QA Round 3

This release polishes the job posting, job detail, offer acceptance, and review screens on provider web and Expo.

| Change | Finding and correction | Files |
|---|---|---|
| Job posting feedback | Web put the progress text above the wizard and requested a second form submit after the location check. The initial submit now snapshots the form, locks immediately, and shows “Posting job…” beside the disabled button. It dispatches the server action once after the location check. Failure unlocks the same draft and shows an error. Successful creation keeps the lock while the job page opens. Mobile already locked before the asynchronous work, but its loading button replaced the title with a spinner. The footer now shows the status visibly beside the spinner and keeps the form locked through success navigation. | `provider-web/src/app/jobs/new/job-form.tsx`, `src/screens/postjob/PostJobStep5Review.js` |
| Duplicate posting | The existing client guards and stable draft IDs cover repeated taps and retries. The public web insert now also handles the race where two attempts both miss the initial lookup. On a uniqueness error it confirms that the exact draft ID belongs to the signed-in requester before returning success. Mobile already verifies this on a collision, and the existing web invited-job RPC serialises attempts for the same draft. No migration is needed. | `provider-web/src/app/work-actions.ts` |
| Offer acceptance | Web keeps “Saving…” and the existing form guard, and shows “Offer accepted.” on the updated job page after the existing RPC succeeds. The banner is limited to the requester on a job with a confirmed winning offer. Mobile Job Detail and Manage Task update in place after success, disable offer acceptance while saving and show an error when it fails. Award and notification logic is unchanged. | `provider-web/src/app/work-actions.ts`, `provider-web/src/app/jobs/[id]/page.tsx`, `src/screens/JobDetailScreen.js`, `src/screens/ManageTaskScreen.js` |
| Category and availability | The posting Review step identifies an automatic description-based suggestion and preserves manual overrides. Job detail labels category and location separately using the existing data. Offer availability uses the shared NZ formatter, for example “Fri 20 Nov 2026”. Existing date inputs and stored calendar date values are preserved. | `provider-web/src/app/jobs/new/job-form.tsx`, `provider-web/src/app/jobs/[id]/page.tsx`, `src/screens/postjob/PostJobStep5Review.js`, `src/lib/categorize.js`, `src/screens/JobDetailScreen.js`, `src/screens/ManageTaskScreen.js`, `shared/offers.ts` |
| Rating controls | Web keeps native radio inputs and uses their labels as pointer targets. The hidden input is now clipped to one pixel so it no longer overlays the full star. Keyboard focus draws a three-pixel inset outline around the visible target. Both clients display the selected rating as text and announce changes. | `provider-web/src/components/star-rating-input.tsx`, `provider-web/src/app/globals.css`, `src/components/ReviewModal.js` |
| Payment explanation | When the web Payment card is visible, it is the single place that explains Rural Connections neither handles nor verifies payment. The general explanation remains on the job detail when the card is absent. Acknowledgement, Undo, payment RPCs and completion sequencing are unchanged. | `provider-web/src/app/jobs/[id]/page.tsx`, `provider-web/src/app/jobs/[id]/payment-requester.tsx` |

## Validation

The regressions cover immediate posting progress before the location check resolves, duplicate clicks, failure and retry with the same form data, busy state through navigation, ownership-checked duplicate recovery, acceptance success and error, category suggestion and override persistence, posted labels, NZ date-only formatting, and rating text and focus semantics. Tests were added or updated in `tests/job-form-feedback.test.mjs`, `tests/grokbot-release1.test.mjs` and `tests/formatting.test.mjs`.

- Targeted regression suite passed all 34 tests.
- Full repository suite passed all 267 tests.
- Provider web production Webpack build passed with the existing Account Help version-import warning.
- Local Android and iOS Expo exports passed.

## Deployment recommendation

Review before deployment. Interactive browser and physical-device checks remain open for the posting progress, acceptance transition, and keyboard and screen-reader rating interaction. Work was local and used fixture configuration. No production deployment, schema or RLS change, Marketplace Health change, or customer communication was performed.
