# Testing notes — Jobs payment handoff

Makes "whose turn is it" clear around payment on an **accepted job**. Rural
Connections never handles money — this only records the handoff. **Bookings are
unchanged.** Bank details only ever travel in the job's message thread, never in
a database column.

You need two accounts: a **requester** (posts the job) and a **provider** (makes
the offer). Reach the point where the requester has **accepted** the provider's
offer.

## The flow in 5 steps

1. **Provider — Next steps.** Open the accepted job. A **Next steps** card shows:
   - *Confirm timing* — a one-tap, editable message ("Hi {name}, I can do … —
     does that suit?"). Sending it posts to the chat.
   - *How would you like to be paid?* — Bank transfer · Cash on the day ·
     Invoice · Already agreed. **Bank transfer** reveals account name / number
     (loose NZ `00-0000-0000000-00(0)` hint) / reference (prefilled with the job
     title), with a preview of the message. Tap **Send**.
2. **Provider — confirmation.** The card collapses to **"Paid by: … · Change"**.
   The requester gets a *payment_details_sent* notification (card icon, tagged
   **YOUR JOB**).
3. **Requester — pay.** Open the job. A **Pay {provider}** card shows the method;
   for bank transfer it shows the details from the message plus the safety line
   *"Only pay the account {provider} sent in this conversation. Rural Connections
   never asks for payment."* Tap **"I've paid — let {provider} know"** (or
   **"Paid on the day"** for cash).
4. **Provider — complete.** The provider gets a *payment_marked_sent*
   notification; the next-step banner becomes **"Payment marked sent · Check it's
   arrived, then mark the job complete."** When they **Mark complete**, the
   "payment has been sorted or agreed" box is **pre-ticked** (web) / the dialog
   notes *"{Requester} marked payment sent on {date}"* (app). The tick is still
   editable.
5. **Reviews** work after completion exactly as before.

## What to look out for

- **Whose-turn flips correctly** at each step on the job page *and* in Home →
  "Needs attention" / Activity, for both the provider and the requester.
- **No bank details in the database** — only in the thread. (Spot-check: the
  `bids` row has `payment_method` / timestamps only, never account numbers.)
- **Permissions:** only the accepted provider can set the method; only the
  requester can mark it sent. Both RPCs reject anyone else at the database level
  (an unauthenticated call returns *permission denied for function*).
- **Cash** says "Paid on the day" everywhere; bank/invoice say "Pay when the work
  is done"; "Already agreed" says "Pay as agreed".
- Before any method is chosen, the requester just sees *"Waiting on {provider} —
  they'll confirm timing and how to pay"* (no action needed yet).

## How to undo

- **Requester:** on the **"Payment marked sent"** card, tap **Undo** — available
  until the job is marked complete. Undo clears the marked-sent state silently
  (no message or notification is posted).
- **Provider:** tap **Change** on the "Paid by" summary to pick a different
  method or resend details (re-callable until payment is marked sent).
