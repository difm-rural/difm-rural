# Marketplace Health Phase 1 deployment

The admin console gets a read-only view of daily activity and current exceptions. Only the report schema is written. Scheduled and manual runs have separate Auckland date keys. Completing a test run early leaves the scheduled 07:00 slot available.

## Local validation

Run `npm test` from the repo root and `npm run build` in `admin-web`. The Node tests exercise the Edge request handler with isolated API mocks.

Run the SQL fixture suite with PostgreSQL 17 on a **fresh, disposable local cluster**, with an empty database and superuser access for fixture setup. It creates minimal source tables, loads the real migration, and rolls back its fixture and DDL transaction. The cluster needs no Supabase extensions for this test. Substitute the port assigned to that cluster.

```sh
psql -X -h 127.0.0.1 -p 56432 -U postgres -d postgres -f tests/sql/marketplace-health.test.sql
```

On an isolated Supabase environment, prevent outbound requests to hosted endpoints before replaying legacy migrations and keep production secrets absent. The readiness report documents bootstrap gaps. Apply the report migration and run `supabase functions serve marketplace-health --no-verify-jwt` with local-only environment settings. Test admin and non-admin sessions, an incorrect scheduler header, and a valid scheduler invocation. Confirm the admin page shows a successful empty report distinctly from a failed or absent run. Test the Cron/Vault integration in that environment before production activation. The plain PostgreSQL suite verifies the calendar gate and transactional SQL, while the Node suite verifies the handler's authorisation and response contract.

## Production release after explicit approval

1. Review pending migrations and apply `20261116100000_marketplace_health.sql` through the normal Supabase migration workflow. This creates reporting objects and an inactive dispatch function, and adds the restrictive authenticated profile INSERT policy. Use a low-traffic window and a short lock budget for the profile policy. Confirm the roles and grants match the migration.
2. Set the Edge Function secret `MARKETPLACE_HEALTH_CRON_SECRET` through the approved secret store. Generate a strong independent random value. The worker uses Supabase's server-side service credential. Validate that the environment supplies the standard URL, anonymous key and a service credential accepted as `service_role`.
3. Deploy `marketplace-health` with `supabase functions deploy marketplace-health --no-verify-jwt`. The scheduler uses its dedicated secret header, so the function performs its own access check. Manual calls verify the caller's Auth token and require `current_user_is_admin()` before accessing the worker RPCs.
4. Deploy the admin console. Check that an administrator can run today's manual report, click into history, and see the same successful run after a duplicate request. Verify a non-admin cannot invoke the Edge worker or read reports. The manual run evaluates current exceptions and the previous Auckland calendar day.
5. Confirm `pg_cron`, `pg_net` and Vault are available and `cron.timezone` is GMT/UTC. In Vault, provision `marketplace_health_url` with the full HTTPS endpoint for the deployed function and `marketplace_health_cron_secret` with the value provisioned in step 2. Enter values through the approved secrets interface and keep them out of shell history, migrations and logs.
6. Activate `supabase/snippets/enable_marketplace_health_schedule.sql` with the database scheduler owner. The two candidate UTC hours cover NZST and NZDT. Dispatch checks Auckland time, starts at 07:00, and checks every five minutes in the 07:00 hour for retries. Report SQL retries are capped at three scheduled claims per date. A lease prevents stale attempts from completing a newer claim; a successful run is immutable through the execution path.
7. Verify the first scheduled report in the admin console. Check Cron execution and Edge status if it is absent. A successful Cron dispatch only means the HTTP request was queued. A report is available once history shows `succeeded`. Failed and interrupted runs remain visible. The Edge HTTP budget is 24 seconds, inside pg_net's 30-second limit. Verify the database-side timeout separately. Disable scheduling with `select cron.unschedule('marketplace-health');` if needed. This preserves report history.

## Interpretation and operating limits

- Public scope uses current job visibility. Counts are based on retained source records. Deleted jobs, withdrawn offers and pruned notifications can reduce historical totals.
- New registrations use Auth creation time. New public jobs and listings use their creation times. Listing activity is broken out by kind. Booking activity and listing exceptions are outside Phase 1.
- Accepted offers display **Unavailable**. There is no protected bid acceptance timestamp, and authenticated users can edit fields on their own notifications. Awards and completions count distinct jobs with eligible history transitions. Immediate reopens are excluded from awards. Mobile can set job status before accepting the winning bid.
- Confirmation requires arrival and a payment method, with only arrival required for unpaid work. An award needs a single valid winner and a current audited transition to classify as waiting or overdue. Missing evidence or contradictory participants appear under Data quality. The report uses schedule estimates for completion. Expiry is separate and begins the day after the requested end in Auckland, using the recognised date or range. A job can appear under expiry and another rule.
- The report stores exception job IDs and operational metadata. The admin UI lists the latest 60 run records. Agree a retention policy and expected reporting volume before production release. This phase does not automatically prune report history.
- An outage can prevent a scheduled run from claiming or completing its slot. Use Cron and Edge logs for missing runs and the manual path for a fresh observation. Historic exception states cannot be reconstructed from mutable marketplace rows.
