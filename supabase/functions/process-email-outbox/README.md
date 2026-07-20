# process-email-outbox

Scheduled worker for transactional and opted-in seasonal email. It claims due
`email_outbox` rows, rechecks current user preferences and campaign eligibility,
suppresses chat email already read in-app, loads the recipient from Supabase
Auth, and sends through Resend.

Seasonal rows are queued each NZ morning by
`public.queue_due_seasonal_campaign_emails()`. The queue enforces active dates,
audience, exact profile-region targeting, the monthly email cap, the global
email switch, the campaign email switch, and the user's `email_seasonal` opt-in.

## Deploy

```sh
supabase functions deploy process-email-outbox --no-verify-jwt
```

It uses the existing `RESEND_API_KEY` and `EMAIL_FUNCTION_SECRET` Edge Function
secrets. Invoke it with `x-email-secret` set to the latter.

## Schedule

Run every five minutes through Supabase Cron. The schedule is managed by
`20260720180000_schedule_email_outbox.sql` and reads the shared secret named
`email_function_secret` from Supabase Vault; the secret is not embedded in
migration SQL or `cron.job`. The request is:

```text
POST https://opagkgfxmjqmnvhrcris.supabase.co/functions/v1/process-email-outbox
x-email-secret: <EMAIL_FUNCTION_SECRET>
Content-Type: application/json
```

The JSON response reports due, sent, cancelled, retried, and failed counts.
Resend message IDs and final delivery state remain in `email_outbox` for
support and auditing.
