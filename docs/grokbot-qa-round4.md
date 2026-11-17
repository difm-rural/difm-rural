# Grok Bot QA Round 4

Round 4 responds to the woolshed-tap run (16 minutes, completed with both 5-star reviews). The run confirmed the Round 3 accept, payment, category, weekday and rating improvements, and found one regression: web job posting published the job but never opened it — the wizard remounted at step 1 with a stale "Resume your draft? … It has not been published" prompt, inviting a duplicate post.

| Change | Finding and correction | Files |
|---|---|---|
| Post job redirect (main regression) | Round 3 made success navigation depend on a client effect (`state.jobId` → `router.push`), which is lost if the form remounts or the tab reloads after the action completes. Success now redirects **from the server action** (the same pattern `removeJob` uses), so landing on the job page with "Job posted." is part of the save response and cannot be raced. The client action wrapper tolerates the redirect resolving without a result and keeps the form locked until navigation unmounts it. The client-side push remains as a fallback if a `jobId` result ever arrives. | `provider-web/src/app/work-actions.ts`, `provider-web/src/app/jobs/new/job-form.tsx` |
| Stale draft honesty | The browser draft is removed at dispatch (the form data is already snapshotted) and re-saved the moment a failure returns, so the resume prompt can no longer claim a published job is unpublished. Safety net: because a draft's id becomes the job id, the form now checks on mount whether a saved draft already exists as a job — if so it shows "Draft already posted" with a link to the job instead of a resumable draft, removing the duplicate-posting path entirely (a repost of the same draft id was already treated as success server-side). | `provider-web/src/app/jobs/new/job-form.tsx` |
| Confirm busy state | The Confirm job card only changed the button label while saving. It now also shows a spinner on the button and a visible "Confirming the job and sending your arrival message…" status line immediately on submit. | `provider-web/src/app/jobs/[id]/confirm-job.tsx` |
| "Offer accepted." visibility | The posted / accepted / edited confirmations and the "Job confirmed." message were 14-px plain text beside the sage next-step banner. They now use a `status-banner` style — sage background, forest text, same weight as the next-step card — so the confirmation is the first thing seen. | `provider-web/src/app/jobs/[id]/page.tsx`, `provider-web/src/app/jobs/[id]/confirm-job.tsx`, `provider-web/src/app/globals.css` |
| Fixed-price label | An offer heading showed "$120" with no pricing basis. Fixed-price offers now read "$120 · Fixed price" on the job page; hourly / per-unit / estimate already carried suffixes. The shared formatter is unchanged because the database `job_payment_line` mirrors it. | `provider-web/src/app/jobs/[id]/page.tsx` |
| Arrival message date (migration, **not yet pushed**) | The confirmation chat message and arrival notifications said "Fri 20 Nov, 10:00am" while the preview and the rest of the job say "Fri 20 Nov 2026, 10:00 am". A migration updates `confirm_job` and `set_work_arrival_window` to `to_char(…, 'Dy FMDD Mon YYYY, FMHH12:MI am')`, matching `formatWorkDateTime`. Apply with `supabase db push` at the next release. | `supabase/migrations/20261117100000_arrival_message_full_date.sql` |

## Listing wizard brought to the same standard

A review of whether listings share the job posting process: the wizard *looks* the same (five steps, the same step validation, submission lock, publishing-location warning and busy treatment) but saves differently — the listing form writes the `services` row straight from the browser with supabase-js and then navigates client-side, rather than through a server action. It therefore never had the round-3 redirect regression, and it has no sessionStorage draft, so no resume prompt can go stale. Two weaker spots were closed:

| Change | Finding and correction | Files |
|---|---|---|
| Duplicate listing on a lost response | The row id was only learned from the insert response (`.select('id').single()`), so if the insert committed but its response was lost, a retry inserted a **second listing**. The id is now chosen client-side before the insert (the job-draft pattern). On a uniqueness error the form confirms the row with that id belongs to the signed-in provider and treats it as success; any other error still keeps the provider on the form with their work intact. | `provider-web/src/app/listings/listing-form.tsx` |
| No publish confirmation | Publishing landed on My listings with nothing to confirm it worked. Publishing now goes to `/listings?published=1` and an edit to `?saved=1`, which render "Listing published." / "Listing changes saved." in the same `status-banner` style as the job page. | `provider-web/src/app/listings/listing-form.tsx`, `provider-web/src/app/listings/page.tsx` |

Four tests were added in `tests/listing-wizard.test.mjs`: a clean publish makes exactly one insert carrying the client-chosen id and lands on the confirmation; a lost response makes one insert then an ownership check and never a second insert; an unrelated failure neither navigates nor loses the form; and My listings announces publish and edit separately. The harness gained a `crypto` stub and an optional Supabase stub.

## Not addressed this round

- **Category pick** ("Buildings & Maintenance" for a woolshed tap; "Water & Drainage" fits better) — the inference lives in the `categorize-job` edge function, which needs a prompt tweak and a production redeploy; flagged for a decision rather than changed silently.
- **Mark complete / review submit latency (7–9 s)** — both show an immediate busy state; the time is server-action latency (RPC plus page revalidation), not a lost state. Worth a separate profiling pass.
- **"Accept this offer" as a collapsible section** — converting it to a button is a layout decision; the collapsible currently carries the agreement checkbox.

## Validation

- `tests/job-form-feedback.test.mjs`: the posting test now also proves the draft is dropped at dispatch and restored on failure; new tests cover the "Draft already posted" link (draft id exists as a job) and the unchanged resume path (it does not).
- `tests/web-job-editor.test.mjs` and `tests/grokbot-release1.test.mjs`: successful `postJob` now asserts the server redirect to `/jobs/<id>?posted=1` (public, suggested-category and invited paths); error paths still return in-form errors without a redirect.
- Full repository suite passed all 270 tests on Node 24.
- Provider web production build passed.
