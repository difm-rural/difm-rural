# Marketplace Health Phase 1 deployment

The admin console gets a read-only view of daily activity and current exceptions. Only the report schema is written. Scheduled and manual runs have separate Auckland date keys. Completing a test run early leaves the scheduled 07:00 slot available.

## Local validation

Run `npm test` from the repo root and `npm run build` in `admin-web`. The Node tests exercise the Edge request handler with isolated API mocks.

Run the SQL fixture suite with PostgreSQL 17 on a **fresh, disposable local cluster**, with an empty database and superuser access for fixture setup. It creates minimal source tables, loads the real migration, and rolls back its fixture and DDL transaction. The cluster needs no Supabase extensions for this test. Substitute the port assigned to that cluster.

```sh
psql -X -h 127.0.0.1 -p 56432 -U postgres -d postgres -f tests/sql/marketplace-health.test.sql
```

On an isolated Supabase environment, prevent outbound requests to hosted endpoints before replaying legacy migrations and keep production secrets absent. The readiness report documents bootstrap gaps. Apply the report migration and run `supabase functions serve marketplace-health` with local-only environment settings and gateway JWT verification enabled. Test admin, non-admin and anonymous requests, plus rejection of scheduler headers. Confirm the admin page shows a successful empty report distinctly from a failed or absent run. The plain PostgreSQL suite verifies the calendar gate and transactional SQL, while the Node suite verifies the handler's authorisation and response contract.

## Production release after explicit approval

1. Review pending migrations and apply `20261116100000_marketplace_health.sql` through the normal Supabase migration workflow. This creates reporting objects and an inactive dispatch function, and adds the restrictive authenticated profile INSERT policy. Use a low-traffic window and a short lock budget for the profile policy. Confirm the roles and grants match the migration.
2. Verify the hosted function runtime supplies the standard URL, anonymous key and server-side service credential. Manual execution requires no scheduler secret.
3. Deploy `marketplace-health` with `supabase functions deploy marketplace-health --use-api`. Its checked-in configuration enables gateway JWT verification. The function separately verifies the session with Supabase Auth and requires `current_user_is_admin()` before accessing the worker RPCs. Requests carrying a scheduler header are rejected.
4. Deploy the admin console. Check that an administrator can run today's manual report, click into history, and see the same successful run after a duplicate request. Verify a non-admin cannot invoke the Edge worker or read reports. The manual run evaluates current exceptions and the previous Auckland calendar day.

## Future scheduled release

Leave Cron unregistered for this release. Before scheduling, separately review a service-to-service endpoint with a dedicated, revocable caller credential, narrowly scoped worker permissions, and independent application-level authentication. Avoid using an administrator's session as a scheduler credential. Verify the gateway policy, egress, rotation and expiry handling, then test Vault, pg_net, Cron, retry limits and the Auckland daylight-saving transition in an isolated environment. Review and adapt the existing dispatcher and schedule snippet to that design before activation. Obtain separate activation approval.

## Interpretation and operating limits

- Public scope uses current job visibility. Counts are based on retained source records. Deleted jobs, withdrawn offers and pruned notifications can reduce historical totals.
- New registrations use Auth creation time. New public jobs and listings use their creation times. Listing activity is broken out by kind. Booking activity and listing exceptions are outside Phase 1.
- Accepted offers display **Unavailable**. There is no protected bid acceptance timestamp, and authenticated users can edit fields on their own notifications. Awards and completions count distinct jobs with eligible history transitions. Immediate reopens are excluded from awards. Mobile can set job status before accepting the winning bid.
- Confirmation requires arrival and a payment method, with only arrival required for unpaid work. An award needs a single valid winner and a current audited transition to classify as waiting or overdue. Missing evidence or contradictory participants appear under Data quality. The report uses schedule estimates for completion. Expiry is separate and begins the day after the requested end in Auckland, using the recognised date or range. A job can appear under expiry and another rule.
- The report stores exception job IDs and operational metadata. The admin UI lists the latest 60 run records. Agree a retention policy and expected reporting volume before production release. This phase does not automatically prune report history.
- An outage can prevent a scheduled run from claiming or completing its slot. Use Cron and Edge logs for missing runs and the manual path for a fresh observation. Historic exception states cannot be reconstructed from mutable marketplace rows.
