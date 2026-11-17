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

The candidate passed local review checks. Deployment and production verification results follow.

## Deployment outcome

Provider web is live and Expo preview is published for Android and iOS from commit `35978ad95a02f4c6e01c629ab06f34b64254f614`. The commit includes the deployed Release 1, Release 2, and Round 2 changes. The three prior release documentation edits remain intact in the working tree and were excluded.

| Check | Result |
|---|---|
| Preflight | All 34 targeted and 267 repository tests passed. The provider web production Webpack build passed with the existing Account Help version-import warning. Android and iOS exports passed from the clean release checkout. The release included no Supabase migrations, RLS, dependency, or mobile runtime configuration changes. |
| Provider web | [Vercel deployment `CBm1XGWodP5zNdH4W1prRW4gURdL`](https://vercel.com/rural-connections/difm-rural/CBm1XGWodP5zNdH4W1prRW4gURdL) succeeded. GitHub deployment record `7845031967` confirmed the release SHA. The Git integration also rebuilt public web and admin from the same commit. Their application source was unchanged. |
| Expo | [Update group `f10364bf-175d-4936-a1cc-41a3ff49eebb`](https://expo.dev/accounts/difmrural/projects/difm-rural/updates/f10364bf-175d-4936-a1cc-41a3ff49eebb) was verified on the active `preview` channel for Android and iOS, runtime `1.0.0`, at the exact clean release commit. |
| Live browser | The approved requester saw the category suggestion explanation, chose a different category, and kept it after a failed test submit. The harness intercepted the write before it reached the server. With the request held, “Posting job…” was visible, the button was disabled, and two rapid clicks produced one request. The completed test job showed separate category and location labels and one payment disclaimer. A label click selected three stars, and ArrowRight selected four with the expected status text and visible three-pixel outline. The successful test session was ended and the disposable browser profiles were removed. |
| Signed-in read checks | Both approved test accounts saw the NZ weekday and date on the completed test fixture's offer and the existing Payment and Undo controls. The approved requester had no committed accepted job on which to verify the acceptance banner. |
| Production rollback | Existing approved-fixture smoke tests exercised job posting with a chosen category, offer creation and editing, acceptance, arrival confirmation, completion, review, and payment acknowledgement and Undo. Both transactions rolled back. Job, bid, review, message, notification, routine, and policy fingerprints matched across the runs. No customer communications were sent and no genuine customer records were modified. |

The accepted-job banner and successful post navigation passed local regressions. Production verification tested the award in the rollback smoke and job posting feedback with a blocked browser write. A browser acceptance and successful posting transition on a dedicated fixture, screen-reader checks, and physical-device installation remain open. No production schema, RLS, Marketplace Health, or Cron changes were made, and no public app-store release was published.
