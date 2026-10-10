-- Security Advisor (database linter) hardening. Two mechanical, low-risk changes:
--
--   1. Pin an empty search_path on handle_new_user — a SECURITY DEFINER trigger that
--      runs as postgres on every auth.users signup. Clears the
--      function_search_path_mutable lint and closes the classic search_path-hijack
--      vector on a definer function.
--
--   2. REVOKE EXECUTE from anon + authenticated on the cron/queue SECURITY DEFINER
--      functions. Clears the {anon,authenticated}_security_definer_function_executable
--      lints for these and removes the manual-invocation / email-spam vector (a logged-in
--      user could otherwise call e.g. queue_daily_opportunity_digests() directly).
--
-- Deliberately NOT touched:
--   - RLS helper definer functions (can_see_job_location, is_accepted_provider,
--     is_invited_to_job, job_owner_id, current_user_is_admin) keep EXECUTE for
--     anon/authenticated — RLS policies invoke them as the calling user and need them.
--   - The security_definer_view ERRORs (connections, profiles_public) are intentional
--     (connections self-filters on auth.uid(); profiles_public is a curated public-column
--     whitelist). Setting security_invoker=true would break both, so they are left alone.

-- 1. handle_new_user: minimal safe search_path.
--    Body references only public.profiles (schema-qualified) and the ->> jsonb operator
--    (pg_catalog is always implicitly searched), so '' resolves with nothing added and a
--    new signup still inserts the profile row exactly as before.
alter function public.handle_new_user() set search_path = '';

-- 2. Lock the cron/queue definer functions to owner (postgres) + service_role only.
--    EXECUTE for anon/authenticated on these is held via explicit role grants (there is
--    no grant to PUBLIC), so revoking from these two roles is sufficient and effective.
--    pg_cron runs each job as postgres (the owner) and edge functions use service_role,
--    so both scheduled and server-side invocation are unaffected.
revoke execute on function public.capture_marketplace_daily_snapshot()          from anon, authenticated;
revoke execute on function public.deliver_instant_opportunity_matches(uuid, uuid) from anon, authenticated;
revoke execute on function public.queue_daily_opportunity_digests()             from anon, authenticated;
revoke execute on function public.queue_daily_saved_interest_digests()          from anon, authenticated;
revoke execute on function public.queue_due_seasonal_campaign_emails()          from anon, authenticated;
revoke execute on function public.queue_due_work_completion_prompts()           from anon, authenticated;  -- already locked (no anon/auth grant); kept for uniformity, harmless no-op
revoke execute on function public.queue_weekly_availability_checks()            from anon, authenticated;
revoke execute on function public.refresh_opportunity_matches_for_job(uuid)     from anon, authenticated;
revoke execute on function public.refresh_opportunity_matches_for_provider(uuid) from anon, authenticated;
revoke execute on function public.refresh_saved_interest_matches_for_job(uuid)  from anon, authenticated;
