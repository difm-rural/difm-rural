# send-push

Sends an Expo push when a `notifications` row is inserted. Wired up by a
Supabase **Database Webhook**, so push delivery rides on the same trigger-driven
notifications the in-app inbox uses.

## Deploy

```sh
# random shared secret the webhook will present
supabase secrets set PUSH_WEBHOOK_SECRET=<long-random-string>
supabase functions deploy send-push --no-verify-jwt
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into edge functions
automatically — no need to set them.

## Create the webhook

Dashboard → **Database → Webhooks → Create a new hook**:

- Table: `notifications`, Events: **Insert**
- Type: **Supabase Edge Functions** → `send-push`
- HTTP Headers: add `x-webhook-secret` = the same value you set above

That's it — inserting a notification row now fires a push to every device the
recipient has registered in `device_push_tokens`.

## Payload

The webhook posts `{ type: 'INSERT', table: 'notifications', record: {...} }`.
The function reads `record.user_id`, `record.type`, `record.body`,
`record.metadata`, looks up the user's tokens, and calls
`https://exp.host/--/api/v2/push/send`. Tokens Expo reports as
`DeviceNotRegistered` are deleted.
