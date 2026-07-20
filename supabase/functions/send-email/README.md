# send-email

Internal transactional-email function backed by Resend. It always sends from
the verified identity:

```text
Rural Connections <notifications@updates.ruralconnections.nz>
```

Replies default to `support@ruralconnections.nz`.

## Configure

`RESEND_API_KEY` should already be stored in Supabase. Create a separate,
random shared secret for authorized callers:

```sh
supabase secrets set EMAIL_FUNCTION_SECRET=<long-random-value>
```

Never put either secret in the mobile app or commit it to this repository.

## Deploy

```sh
supabase functions deploy send-email --no-verify-jwt
```

`--no-verify-jwt` is intentional. Database webhooks and scheduled jobs do not
have a user JWT; the `x-email-secret` header authenticates them instead.

## Test

Replace the placeholders and run from Command Prompt:

```cmd
curl -i -X POST "https://opagkgfxmjqmnvhrcris.supabase.co/functions/v1/send-email" -H "Content-Type: application/json" -H "x-email-secret: YOUR_EMAIL_FUNCTION_SECRET" -d "{\"to\":\"YOUR_EMAIL_ADDRESS\",\"subject\":\"Rural Connections email test\",\"text\":\"Your Supabase and Resend email integration is working.\"}"
```

A successful response contains the Resend message `id`. Delivery details are
available in the Resend Emails dashboard and function failures in Supabase
Edge Function logs.

## Payload

```json
{
  "to": "person@example.com",
  "subject": "New offer received",
  "text": "Your fencing job has received a new offer.",
  "html": "<p>Your fencing job has received a new offer.</p>",
  "replyTo": "support@ruralconnections.nz",
  "idempotencyKey": "notification-uuid"
}
```

`to` may be one address or an array of up to ten. Supply `text`, `html`, or
both. `idempotencyKey` is recommended when retrying a database event.
