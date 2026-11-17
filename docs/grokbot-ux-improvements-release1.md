# Grok Bot UX improvements — Release 1

Release 1 covers the non-payment findings for mobile and authenticated provider web.

| Area | Changes and affected files |
|---|---|
| Job creation and editing | The mobile posting wizard checks that the edit actually updated a row before showing success, retains the draft on failure, and distinguishes a saved job from a failed photo save. The web wizard shows distinct post and edit confirmations on the saved job page. See `src/screens/postjob/PostJobStep5Review.js`, `provider-web/src/app/jobs/new/job-form.tsx` and `provider-web/src/app/jobs/[id]/page.tsx`. |
| Offers | New lines start blank with an example placeholder, and hourly guidance appears only for hourly pricing. Saved line descriptions, rates and availability populate the edit form. Web keeps the form inputs when a save fails and accepts a saved past date on an edit without opening up past dates for new offers. Mobile checks that the pending offer still exists before confirming an edit. Both use DD/MM/YYYY for offer availability with the existing ISO date stored. The web and mobile views remove redundant headings or prices. See `shared/offers.ts`, `shared/dates.ts`, `src/lib/offers.js`, `src/screens/JobDetailScreen.js`, `src/screens/ManageTaskScreen.js`, and the provider web offer form, offer input parser, job page and server actions. |
| Arrival and completion | New time proposals require a clock time chosen by the provider. A requested or offered day may still be preselected. A saved arrival opens at its existing time when edited. The provider gets feedback only after the operation succeeds, and an in-flight request is guarded against duplicate submission. The active requester next action counts pending offers rather than historical offers. See `src/lib/quickPickDates.js`, `src/components/ArrivalWhen.js`, `src/components/ArrivalWindowModal.js`, `src/components/ConfirmJobSheet.js`, both mobile job screens, and `provider-web/src/app/jobs/[id]/confirm-job.tsx`. |
| Reviews | Completed jobs show separate status for the signed-in participant and the other actual participant. The web timeline no longer labels the job “Reviewed” when one review exists. Unavailable reads are distinguished from confirmed absence. The web job review form controls the rating and comment so a failed save keeps both. See `shared/jobReviewStatus.ts`, both mobile job screens, and the web job page, `reviews-section.tsx`, `job-review-form.tsx` and `star-rating-input.tsx`. |
| Sign-in and accessibility | The shared sign-in hint distinguishes entering an email, the password step and the email-code step. Web job actions use native buttons and disclosure controls with visible keyboard focus. The shared web save form prevents duplicate submission. Mobile retains accessible button labels and native pickers and displays useful errors without closing failed forms. See `shared/reviewAccount.ts`, `provider-web/src/components/action-form.tsx`, `provider-web/src/app/globals.css` and the mobile flow files above. |

Mobile uses native alerts, day and time chips and native date/time pickers. Web uses labelled fields, inline status/error feedback and native disclosures. Offer dates display consistently across clients, and arrival times continue to use the existing local input and storage conversion.

## Verification

- Full repository suite passed, 254 tests. New and updated coverage exercised offer defaults and retained inputs after failure, hourly guidance, NZ date parsing and display, saved offer dates, explicit arrival times and edit prefill, duplicate web submits, sign-in wording and independent review indicators. Existing job and offer lifecycle and Release 2 payment regression tests passed.
- Provider web production Webpack build passed with local fixture configuration.
- Expo exports passed for Android and iOS.

Physical-device and interactive browser keyboard and screen-reader checks remain outstanding. This release preserves existing marketplace authorization, Supabase schema and RLS, and the payment acknowledgement and completion separation from Release 2. The job confirmation screens changed only their scheduling controls and save feedback. Marketplace Health and Cron were outside this release.

## Production deployment — 17 November 2026 (NZDT)

**Deployed to provider web and Expo preview. The rollback-only write-path retest passed.**

| Check | Outcome |
|---|---|
| Candidate | Commit `d7afcec1550fa1aa5b13364344ad8e18f6794a5d` includes the deployed Release 2 commit `15af7d8`. The unrelated local Release 2 documentation edit was excluded from the release commit and remained the only working-tree change during the Expo publish. This accounts for the EAS dirty marker. |
| Preflight | All 254 repository tests, provider web production Webpack build, and Android and iOS exports passed again. The linked Supabase dry run was clean. No SQL or RLS change was applied. |
| Vercel | Provider web production deployment `7841163046` succeeded for the release commit. |
| Expo | Published Android and iOS update group `a105c3f4-4731-45f5-81a9-4ab437f11a07` to `preview`, runtime `1.0.0`. Public app stores were outside this rollout. |
| Signed-in web smoke | Both dedicated participants opened the completed test job. Each saw independent review indicators, the Payment section, its action button and the Undo dialog. The test provider opened the empty offer form and their own job edit page. The live offer form had a DD/MM/YYYY field, the Labour example placeholder and no hourly guidance when fixed pricing was selected. These were read-only HTTP checks. |
| Dashboard warning | Reproduced on the live provider dashboard. Its offer-job lookup selects `accepted_at` from `jobs_public`; that column exists on `jobs` but is absent from the view. PostgREST returned `42703` for the view lookup. The dashboard fix was excluded from Release 1. |
| Rollback-only write smoke | The test stopped at its own offer-edit assertion because it compared `bids.available_from`, a text column in production, directly with a date. The RPC call had returned, but the assertion did not validate its result. The transaction aborted. A read-only follow-up found zero test job, edited offer or test notification rows. No genuine customer records were used for writes. |

## Dashboard correction and production retest — 17 November 2026 (NZDT)

The dashboard used `accepted_at` to sort recent activity within its existing action groups. The provider lookup requested the field from `jobs_public`, where it is absent. `provider-web/src/app/page.tsx` continues to read display fields from the masked view and reads only the award timestamp through an existing participant-authorised join. The join is limited to the signed-in provider's accepted bids for accepted jobs returned by the view. If the join yields no timestamp, ordering uses the remaining activity timestamps. A failed query still displays the warning and preserves activity that loaded successfully. This correction is local and awaits deployment review. The existing production build can still show the warning.

- `tests/web-dashboard-activity.test.mjs` verifies the view query, award ordering, no warning on successful loads, fallback for an absent timestamp, and partial activity with a warning on a query error.
- `tests/sql/release1-job-flow-rollback.sql` compares the stored offer date text with the expected date converted to text. The corrected test passed in isolated PostgreSQL and in production using the approved test accounts. It verified requester job posting and offer acceptance and provider offer submission, offer editing, arrival confirmation and completion.
- The existing Release 2 rollback smoke verified payment acknowledgement and Undo for accepted and completed jobs, denial for a non-participant and for open and cancelled jobs, and completion and review while payment was unacknowledged. Release 2 payment source files were untouched.
- Before-and-after production fingerprints matched for jobs, bids, reviews, notifications, messages, the checked routines and marketplace policies. Both test transactions rolled back. No customer communications were sent.
- All 257 repository tests and the provider web production Webpack build with local fixture configuration passed. No migration, RLS change or deployment was needed for the correction.

The SQL smoke verified persisted values within the test transaction and database authorisation. Interactive production checks for save and error feedback, arrival controls, device installation and accessibility remain open. Dashboard success and failure rendering were exercised by local regression tests.

## Dashboard correction deployment

Provider web deployed from `f4f3072e4ac1f4782d5a17cd1e6d767030db32f7`. [Vercel deployment `3pVjpZ574U4dsUDDpRDH2kgCRX4P`](https://vercel.com/rural-connections/difm-rural/3pVjpZ574U4dsUDDpRDH2kgCRX4P) succeeded, with GitHub deployment record `7841782091` tied to the same commit. The Git integration also rebuilt the public and admin projects from that commit. The only application source change in the commit was in provider web. The Release 2 documentation edit remains local and excluded. No Supabase or Expo deployment was performed.

- All three dashboard regression tests and all 257 repository tests passed. The provider web production Webpack build passed with the existing Account Help version-import warning.
- The approved requester and provider loaded the production dashboard without the activity warning. All three displayed provider job links matched jobs owned by or bid on by that provider. The requester had no in-flight job links. The dashboard continues to load offer job display fields from the privacy-masked view. The test did not target a specific invite-only fixture.
- On the completed test job, both accounts saw independent review indicators and the Payment section with the Undo dialog. The provider offer form still showed the NZ date format and Labour example placeholder. Verification used authenticated reads and ended both test sessions. No marketplace records were modified.
- The approved provider had no current accepted job, so live accepted-job display and timestamp ordering remain unverified. The local dashboard regression covers both, as well as the warning and partial activity on a simulated lookup failure.
