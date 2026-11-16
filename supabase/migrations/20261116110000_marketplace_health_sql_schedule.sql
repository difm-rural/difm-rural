begin;
set local search_path = pg_catalog;

do $$
declare
  signature text;
  routine regprocedure;
  owner_oid oid := 'postgres'::regrole;
  reviewed constant text[] := array[
    'public.can_see_job_location(uuid)',
    'public.current_user_is_admin()',
    'public.is_accepted_provider(uuid)',
    'public.is_invited_to_job(uuid)',
    'public.job_owner_id(uuid)',
    'public.capture_booking_status_history()',
    'public.capture_job_status_history()',
    'public.enqueue_notification_email()',
    'public.handle_new_user()',
    'public.notify_bid_placed()',
    'public.notify_bid_status_change()',
    'public.notify_booking_created()',
    'public.notify_booking_status_change()',
    'public.notify_job_invite()',
    'public.notify_job_status_change()',
    'public.notify_new_booking_message()',
    'public.notify_new_message()',
    'public.notify_new_question()',
    'public.notify_question_answered()',
    'public.notify_review_created()',
    'public.notify_send_push()',
    'public.on_job_refresh_opportunities()',
    'public.on_job_refresh_saved_interests()',
    'public.on_opportunity_preferences_refresh()',
    'public.on_provider_availability_refresh()',
    'public.on_provider_refresh_opportunities()',
    'public.protect_bid_integrity()',
    'public.protect_profile_privileged_cols()'
  ];
begin
  if current_user <> 'postgres' then
    raise exception 'Marketplace Health scheduler migration requires postgres';
  end if;

  foreach signature in array reviewed loop
    routine := to_regprocedure(signature);
    if not exists (
      select from pg_proc p
      where p.oid = routine and p.proowner = owner_oid and p.prosecdef
        and (
          select array_agg(a.grantee order by a.grantee)
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.privilege_type = 'EXECUTE' and a.grantor = owner_oid
            and not a.is_grantable
        ) @> array[0::oid, owner_oid, 'anon'::regrole::oid,
                   'authenticated'::regrole::oid, 'service_role'::regrole::oid]
    ) then
      raise exception 'Marketplace Health reviewed owner or EXECUTE grant differs for %', signature;
    end if;

    execute format('revoke execute on function %s from public', routine);
  end loop;
end;
$$;

-- The Cron connection switches to this role for each report transaction.
create role marketplace_health_cron nologin noinherit
  nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant marketplace_health_cron to postgres with inherit false, set true;

-- Retire the unused HTTP dispatcher. The manual Edge and public RPCs are unchanged.
drop function marketplace_health_private.dispatch();

create function marketplace_health_private.claim_scheduled()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := statement_timestamp();
  v_local timestamp := v_now at time zone 'Pacific/Auckland';
begin
  -- Recover durable claims left by a disconnected or terminated worker.
  update marketplace_health_private.runs
  set status = 'failed', finished_at = clock_timestamp(), report = null
  where source = 'scheduled' and status = 'running'
    and started_at <= v_now - interval '5 minutes'
    and (attempts >= 3 or run_date < v_local::date
      or (run_date = v_local::date and v_local::time >= time '08:00'));

  -- Pass the claim only to the next transaction on this Cron connection.
  perform set_config('marketplace_health.scheduled_claim',
    public.marketplace_health_claim('scheduled')::text, false);
end;
$$;

create function marketplace_health_private.finish_scheduled()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_claim jsonb := nullif(current_setting('marketplace_health.scheduled_claim', true), '')::jsonb;
  v_day date;
  v_claim_id uuid;
begin
  if v_claim->>'status' is distinct from 'claimed' then return; end if;
  v_day := (v_claim->>'run_date')::date;
  v_claim_id := (v_claim->>'claim_id')::uuid;
  perform set_config('marketplace_health.scheduled_claim', '', false);
  perform public.marketplace_health_finish(v_day, 'scheduled', v_claim_id);
exception when query_canceled then
  -- OTHERS in the shared finish function deliberately excludes cancellation.
  -- The subtransaction has rolled back the report attempt; keep the claim's
  -- attempt count and only mark this worker's still-current claim failed.
  update marketplace_health_private.runs
  set status = 'failed', finished_at = clock_timestamp(), report = null
  where run_date = v_day and source = 'scheduled'
    and claim_id = v_claim_id and status = 'running';
  perform set_config('marketplace_health.scheduled_claim', '', false);
end;
$$;

revoke all on function marketplace_health_private.claim_scheduled(),
  marketplace_health_private.finish_scheduled()
  from public, anon, authenticated, service_role;
grant usage on schema marketplace_health_private to marketplace_health_cron;
grant execute on function marketplace_health_private.claim_scheduled(),
  marketplace_health_private.finish_scheduled() to marketplace_health_cron;

-- Fail closed on unreviewed definer functions or overloads accessible to the
-- worker. The worker has USAGE on public via PUBLIC and on its private schema.
do $$
declare
  unexpected regprocedure;
begin
  select p.oid::regprocedure into unexpected
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and n.nspname not in ('pg_catalog', 'information_schema')
    and has_schema_privilege('marketplace_health_cron', n.oid, 'USAGE')
    and has_function_privilege('marketplace_health_cron', p.oid, 'EXECUTE')
    and p.oid not in ('marketplace_health_private.claim_scheduled()'::regprocedure,
                      'marketplace_health_private.finish_scheduled()'::regprocedure)
  order by p.oid
  limit 1;
  if unexpected is not null then
    raise exception 'Marketplace Health worker can execute unexpected SECURITY DEFINER routine %', unexpected;
  end if;
end;
$$;

commit;
