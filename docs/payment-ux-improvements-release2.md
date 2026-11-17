# Payment UX improvements — Release 2

The job detail screens on mobile and provider web now display one Payment section for the requester and the accepted provider. An acknowledgement is optional and independent of the work timeline. The section remains visible after acknowledgement and can show the actor's role when the stored user ID identifies a participant. It displays the agreed method when available and does not reproduce bank details from the conversation.

Both clients use an accessible button, offer a confirmation before Undo, block repeat submissions while saving, and show success or failure feedback. Undo restores the reminder on success and preserves the current status on failure. Web uses the browser's modal dialog with a labelled title, description, Cancel and Undo buttons, keyboard support and visible focus. Mobile uses the shared button and native confirmation alert.

## Work lifecycle

- The mobile and web completion flows now submit only work completion. Previously an optional checkbox called the payment RPC first and an RPC error could prevent completion. The completion form no longer shows payment status or controls.
- Job detail derives confirmation from the work schedule. The arrival summary remains separate from the Payment section. The provider can confirm with the existing `agreed` option preselected, and bank details are optional. The shared next-action logic ignores `payment_sorted_at`. List views with no schedule data retain the existing method-based confirmation fallback.
- Review eligibility still follows completed work and participant identity. Completion preserves both payment fields, whether an acknowledgement exists or not.

## Payment RPC correction

Migration `20261117020000_payment_acknowledgement_completed.sql` replaces the existing `mark_job_payment_sorted(p_bid, p_undo)` body. Both participants can mark or undo acknowledgement on accepted or completed jobs. Open and cancelled jobs are rejected, as are jobs without a valid winning bid. A pending or missing bid, a missing or self-awarded provider, and multiple accepted bids do not qualify. The legacy `mark_job_payment_sent` wrapper still delegates to the same RPC.

The RPC retains SECURITY DEFINER and authenticated EXECUTE, with PUBLIC and anonymous execution revoked. Its internal checks require the caller to be the requester or winning provider. Existing bid visibility RLS scopes reads to the provider and job owner. Existing bid policies and triggers were left in place. The RPC checks protect this entry point. Existing direct bid update grants remain outside its scope.

The function takes a shared lock on the job before locking and re-reading the target bid. This follows the job-to-bid order in `accept_job_offer`. The job lock orders an acknowledgement against a concurrent status update, and the bid lock makes identical concurrent submissions a no-op after the first commit. A real change updates only `bids.payment_sorted_at` and `bids.payment_sorted_by` and writes the same thread audit message and notification as before. Its status, confirmation and review rules are unchanged. Both clients now enable the same accessible Payment controls after completion for an authorised participant with an accepted bid.

The confirmation RPC still requires a valid method value, so both clients use the existing `agreed` value when people arrange payment directly. Its legacy server-generated cash wording still says “cash on the day” and the confirmation preview mirrors that message. A small follow-up could change the cash label in `job_payment_line` and the same label in the current `confirm_job` definition, then update the preview and test both. This release does not change stored arrangements, chat history or Marketplace Health.

## Files and verification

| Area | Files |
|---|---|
| Shared payment copy, attribution and eligibility | `shared/paymentAcknowledgement.ts` |
| Shared work progress | `shared/nextMove.ts`, `shared/nextMove.test.ts` |
| Mobile acknowledgement, confirmation and completion | `src/components/JobPaymentHandoff.js`, `src/components/ConfirmJobSheet.js`, `src/components/MarkCompleteSheet.js`, `src/screens/JobDetailScreen.js`, `src/screens/ManageTaskScreen.js` |
| Web job detail, dialog, focus and server actions | `provider-web/src/app/jobs/[id]/page.tsx`, `confirm-job.tsx` and `payment-requester.tsx` in that directory, `provider-web/src/app/globals.css`, `provider-web/src/app/work-actions.ts`, `provider-web/src/app/activity/actions.ts`, `provider-web/src/components/work/manage-actions.tsx` |
| Forward migration | `supabase/migrations/20261117020000_payment_acknowledgement_completed.sql` |
| Regression coverage | `tests/payment-acknowledgement.test.mjs`, `tests/web-mark-complete.test.mjs`, `tests/sql/payment-acknowledgement.test.sql`, `tests/sql/payment-acknowledgement-concurrency.test.sql`, `tests/sql/payment-acknowledgement-fixture.sql` |

- Full repository suite: 248 tests passed. Mobile and web component tests exercised visible states, duplicate submission, cancellation, successful Undo, and failure feedback. Work tests checked the next action in both payment states, ignored a legacy web completion payment field, and verified both parties can review completed work.
- Disposable PostgreSQL 17 schema replay and the new SQL matrix passed. They exercised requester and provider acknowledgement, Undo, duplicate idempotency, outsider denial, confirmation with the default method, completion with and without acknowledgement, a review on completed unsorted work, completed-job mark and Undo for both parties, rejection of open and cancelled jobs and invalid awards, and preservation of audit messages and notifications. The separate loopback dblink test exercises the real locks with two overlapping sessions. It checks concurrent duplicates and a cancellation racing with acknowledgement.
- Provider web production Webpack build and Expo Android and iOS exports passed with local fixture configuration. Native device and browser assistive-technology checks remain outstanding.

Apply the forward migration before deploying the client controls so completed jobs are eligible as soon as those controls appear. Review before deployment. No production systems were contacted, and Marketplace Health was outside this change.
