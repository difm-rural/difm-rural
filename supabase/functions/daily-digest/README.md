# daily-digest

Sends each opted-in user one **daily summary push** — a concise, role-aware
roll-up of their jobs, services and bookings in flight. Reuses the same Expo
Push pipeline and `device_push_tokens` table as `send-push`.

- Opt-in: `user_preferences.daily_digest` (boolean, off by default). Toggled in
  the app at **Account → App → Daily summary**.
- Users with nothing in flight, or no registered device, are skipped (no empty
  pings).
- Push only — no email provider required. Remote push needs a real build
  (EAS dev/production); it does **not** arrive in Expo Go.

## One-time setup

### 1. Apply the migration (adds the opt-in column)
Run `supabase/migrations/20260626120000_daily_digest_pref.sql` (CLI `db push`,
or paste into the Supabase SQL editor).

### 2. Deploy the function + set its secret
```bash
supabase functions deploy daily-digest --no-verify-jwt
supabase secrets set DIGEST_CRON_SECRET=<a long random string>
```
(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

### 3. Schedule it with pg_cron (run once in the SQL editor)
Replace `<PROJECT_REF>` and `<DIGEST_CRON_SECRET>` with your values.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 19:00 UTC ≈ 7am NZST (8am during NZDT). pg_cron runs in UTC; adjust the hour
-- for daylight saving if you want it pinned to exactly 7am year-round.
select cron.schedule(
  'daily-digest',
  '0 19 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<DIGEST_CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

To change the time: `select cron.unschedule('daily-digest');` then re-run with a
new cron expression. To test immediately, you can run the `net.http_post(...)`
statement on its own, or `curl -X POST` the function URL with the
`x-cron-secret` header.

> The cron secret is stored in the `cron.job` table. For production, move it to
> Supabase Vault and read it in the SQL instead of inlining it.
