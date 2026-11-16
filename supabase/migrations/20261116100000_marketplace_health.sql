-- Protect the admin reporting boundary even if an Auth account has no profile.
-- The existing profile trigger protects updates; own-profile inserts use RLS.
create policy "Users cannot insert an admin profile"
  on public.profiles as restrictive for insert to authenticated
  with check (is_admin is not true);

create schema if not exists marketplace_health_private;
revoke all on schema marketplace_health_private from public, anon, authenticated, service_role;

create table marketplace_health_private.runs (
  run_date date not null,
  source text not null check (source in ('scheduled', 'manual')),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  attempts integer not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  claim_id uuid not null,
  report jsonb,
  primary key (run_date, source)
);
alter table marketplace_health_private.runs enable row level security;
revoke all on marketplace_health_private.runs from public, anon, authenticated, service_role;

create function marketplace_health_private.scheduled_day(p_now timestamptz)
returns date language sql stable set search_path = '' as $$
  select local_time::date
  from (select p_now at time zone 'Pacific/Auckland' as local_time) nz
  where extract(hour from local_time) = 7;
$$;

create function marketplace_health_private.requested_end(
  schedule_type text, scheduled_date text, date_from date, date_to date
) returns date language plpgsql stable set search_path = '' as $$
begin
  if (schedule_type = 'range' or (nullif(btrim(schedule_type), '') is null and scheduled_date is null))
     and date_from <= date_to then
    return date_to;
  end if;
  if (schedule_type = 'specific' or nullif(btrim(schedule_type), '') is null)
     and scheduled_date ~ '^\d{4}-\d{2}-\d{2}($|T)' then
    if length(scheduled_date) = 10 then return scheduled_date::date; end if;
    return (scheduled_date::timestamptz at time zone 'Pacific/Auckland')::date;
  end if;
  return null;
exception when invalid_datetime_format or datetime_field_overflow then
  return null;
end;
$$;

create function marketplace_health_private.report(p_day date, p_as_of timestamptz)
returns jsonb language sql stable set search_path = '' as $$
with bounds as (
  select (p_day - 1)::timestamp at time zone 'Pacific/Auckland' as day_start,
         p_day::timestamp at time zone 'Pacific/Auckland' as day_end,
         (p_as_of at time zone 'Pacific/Auckland')::date as local_day
),
active_jobs as (
  select j.id, j.status, j.created_at, j.requester_id, j.price_type,
         marketplace_health_private.requested_end(j.schedule_type, j.scheduled_date, j.date_from, j.date_to) as requested_end
  from public.jobs j
  where j.visibility = 'public' and j.status in ('open', 'accepted') and j.created_at <= p_as_of
),
offer_facts as (
  select b.job_id, count(*) filter (where b.status in ('pending', 'accepted')) as active_offers,
         count(*) filter (where b.status = 'accepted') as winners,
         count(*) filter (where b.status = 'pending' and b.created_at < p_as_of - interval '24 hours') as stale_offers,
         min(b.created_at) filter (where b.status = 'pending' and b.created_at < p_as_of - interval '24 hours') as oldest_stale_offer
  from public.bids b join active_jobs j on j.id = b.job_id
  group by b.job_id
),
facts as (
  select j.*, coalesce(o.active_offers, 0) as active_offers, coalesce(o.winners, 0) as winners,
         o.stale_offers, o.oldest_stale_offer, w.expected_complete_at,
         (w.arrival_start_at is not null and (j.price_type = 'unpaid' or b.payment_method is not null)) is true as confirmed,
         case when h.from_status = 'open' and h.to_status = 'accepted'
                   and h.changed_at >= j.created_at and h.changed_at >= b.created_at
                   and h.changed_at <= p_as_of then h.changed_at end as award_at,
         case
           when j.status = 'open' and o.winners > 0 then 'open_with_winner'
           when j.status = 'accepted' and coalesce(o.winners, 0) <> 1 then 'winner_count'
           when j.status = 'accepted' and (b.provider_id is null or b.provider_id = j.requester_id or b.created_at is null)
             then 'invalid_winner'
           when j.status = 'accepted' and w.job_id is not null
                and (w.provider_id is distinct from b.provider_id or w.requester_id is distinct from j.requester_id)
             then 'schedule_participants'
         end as contradiction
  from active_jobs j
  left join offer_facts o on o.job_id = j.id
  left join public.bids b on b.job_id = j.id and o.winners = 1 and b.status = 'accepted'
  left join public.work_schedules w on w.job_id = j.id
  left join lateral (
    select from_status, to_status, changed_at from public.job_status_history
    where job_id = j.id and j.status = 'accepted'
    order by changed_at desc, id desc limit 1
  ) h on true
),
signals as (
  select f.id as job_id, f.status, f.requested_end, coalesce(f.stale_offers, 0) as stale_offer_count,
         f.winners as winning_offer_count, signal.code, signal.anchor_at, signal.deadline_at,
         signal.deadline_source, signal.confidence, signal.suggested_action, signal.detail
  from facts f cross join bounds d
  cross join lateral (
    select 'data_quality' as code, f.award_at as anchor_at, null::timestamptz as deadline_at,
           null::text as deadline_source, 'unavailable' as confidence,
           'Reconcile the job status, winning offer and award history before follow-up.' as suggested_action,
           coalesce(f.contradiction, case when f.award_at is null then 'award_event_missing_or_inconsistent'
                                         else 'expected_finish_missing' end) as detail
    where f.contradiction is not null or (f.status = 'accepted' and
      (f.award_at is null or (f.confirmed and f.expected_complete_at is null)))
    union all
    select 'no_active_offers', f.created_at, f.created_at + interval '48 hours',
           'job_created_at', 'observed', 'Review the post scope and provider coverage.', null
    where f.status = 'open' and f.contradiction is null and f.active_offers = 0
      and f.created_at < p_as_of - interval '48 hours'
    union all
    select 'offer_awaiting_decision', f.oldest_stale_offer, f.oldest_stale_offer + interval '24 hours',
           'oldest_pending_offer_created_at', 'observed', 'Review the pending decisions with the requester.', null
    where f.status = 'open' and f.contradiction is null and f.stale_offers > 0
    union all
    select 'waiting_to_confirm', f.award_at, f.award_at + interval '24 hours',
           'job_award_history', 'audited', 'Check with the winning provider about the missing confirmation.', null
    where f.status = 'accepted' and f.contradiction is null and not f.confirmed
      and f.award_at <= p_as_of - interval '24 hours'
    union all
    select 'overdue_completion', f.expected_complete_at, f.expected_complete_at + interval '24 hours',
           'work_schedule_expected_complete_at', 'estimate', 'Check whether the work is complete or needs a revised finish.', null
    where f.status = 'accepted' and f.contradiction is null and f.award_at is not null and f.confirmed
      and f.expected_complete_at < p_as_of - interval '24 hours'
    union all
    select 'expired_requested_date', expiry.at, expiry.at,
           'requested_end_auckland', 'observed', 'Check whether the requested date or job availability should be updated.', null
    from (select (f.requested_end + 1)::timestamp at time zone 'Pacific/Auckland' as at) expiry
    where f.requested_end < d.local_day
  ) signal
),
recent_awards as (
  select h.job_id, h.id, h.changed_at
  from public.job_status_history h join public.jobs j on j.id = h.job_id cross join bounds d
  where j.visibility = 'public' and h.from_status = 'open' and h.to_status = 'accepted'
    and h.changed_at >= d.day_start and h.changed_at < d.day_end
    and (select next.to_status from public.job_status_history next
         where next.job_id = h.job_id and (next.changed_at, next.id) > (h.changed_at, h.id)
         order by next.changed_at, next.id limit 1) is distinct from 'open'
)
select jsonb_build_object(
  'rule_version', 1, 'as_of', p_as_of, 'activity_date', p_day - 1,
  'day_start', d.day_start, 'day_end', d.day_end,
  'activity', jsonb_build_object(
    'registrations', (select count(*) from auth.users u where u.created_at >= d.day_start and u.created_at < d.day_end),
    'public_jobs', (select count(*) from public.jobs j where j.visibility = 'public' and j.created_at >= d.day_start and j.created_at < d.day_end),
    'listings', (select coalesce(jsonb_object_agg(kind, total), '{}'::jsonb) from (
      select coalesce(kind, 'unknown') as kind, count(*) as total from public.services
      where created_at >= d.day_start and created_at < d.day_end group by 1
    ) counts),
    'offers_submitted', (select count(*) from public.bids b join public.jobs j on j.id = b.job_id
      where j.visibility = 'public' and b.created_at >= d.day_start and b.created_at < d.day_end),
    -- There is no protected bid acceptance timestamp. Notifications are mutable.
    'offers_accepted', null::integer,
    'jobs_awarded', (select count(distinct job_id) from recent_awards),
    'jobs_completed', (select count(distinct h.job_id) from public.job_status_history h join public.jobs j on j.id = h.job_id
      where j.visibility = 'public' and h.from_status is not null and h.to_status = 'completed'
        and h.changed_at >= d.day_start and h.changed_at < d.day_end)
  ),
  'exceptions', (select coalesce(jsonb_agg(to_jsonb(s) ||
      jsonb_build_object('age_hours', extract(epoch from (p_as_of - s.anchor_at)) / 3600)
      order by s.code, s.anchor_at, s.job_id), '[]'::jsonb) from signals s)
)
from bounds d;
$$;

create function public.marketplace_health_claim(p_source text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := statement_timestamp();
  v_local timestamp := v_now at time zone 'Pacific/Auckland';
  v_run marketplace_health_private.runs;
begin
  if p_source is null or p_source not in ('scheduled', 'manual') then
    raise exception 'Invalid report source' using errcode = '22023';
  end if;
  if p_source = 'scheduled' and marketplace_health_private.scheduled_day(v_now) is null then
    return jsonb_build_object('status', 'outside_window');
  end if;
  insert into marketplace_health_private.runs as r (run_date, source, status, attempts, started_at, claim_id)
  values (v_local::date, p_source, 'running', 1, v_now, gen_random_uuid())
  on conflict (run_date, source) do update
    set status = 'running', attempts = r.attempts + 1, started_at = v_now,
        finished_at = null, claim_id = gen_random_uuid()
    where r.status <> 'succeeded'
      and (r.status = 'failed' or r.started_at <= v_now - interval '5 minutes')
      and (p_source = 'manual' or r.attempts < 3)
  returning * into v_run;
  if v_run.claim_id is null then
    select * into v_run from marketplace_health_private.runs
    where run_date = v_local::date and source = p_source;
    return jsonb_build_object('status', case when v_run.status = 'succeeded' then 'already_succeeded'
      when v_run.status = 'running' and v_run.started_at > v_now - interval '5 minutes' then 'in_progress'
      else 'retry_exhausted' end);
  end if;
  return jsonb_build_object('status', 'claimed', 'run_date', v_run.run_date, 'claim_id', v_run.claim_id);
end;
$$;

create function public.marketplace_health_finish(p_day date, p_source text, p_claim uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_run marketplace_health_private.runs;
begin
  select * into v_run from marketplace_health_private.runs
  where run_date = p_day and source = p_source and claim_id = p_claim and status = 'running'
    and started_at > statement_timestamp() - interval '5 minutes'
  for update;
  if not found then return 'claim_lost'; end if;
  begin
    update marketplace_health_private.runs
    set report = marketplace_health_private.report(p_day, statement_timestamp()),
        status = 'succeeded', finished_at = clock_timestamp()
    where run_date = p_day and source = p_source;
    return 'succeeded';
  exception when others then
    update marketplace_health_private.runs set status = 'failed', finished_at = clock_timestamp()
    where run_date = p_day and source = p_source;
    return 'failed';
  end;
end;
$$;

create function public.marketplace_health_history(p_day date default null, p_source text default 'scheduled')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'today', (statement_timestamp() at time zone 'Pacific/Auckland')::date,
    'history', (select coalesce(jsonb_agg(to_jsonb(h) order by h.run_date desc, h.source), '[]'::jsonb)
      from (select run_date, source, case
              when status = 'running' and started_at <= statement_timestamp() - interval '5 minutes' then 'interrupted'
              else status end as status, attempts, started_at, finished_at
            from marketplace_health_private.runs order by run_date desc, source limit 60) h),
    'report', (select report from marketplace_health_private.runs
      where run_date = coalesce(p_day, (statement_timestamp() at time zone 'Pacific/Auckland')::date) and source = p_source
        and status = 'succeeded')
  );
end;
$$;

-- Vault and Cron are only needed when an operator explicitly enables dispatch.
create function marketplace_health_private.dispatch()
returns void language plpgsql set search_path = '' as $$
declare
  v_day date := marketplace_health_private.scheduled_day(statement_timestamp());
  v_url text;
  v_secret text;
begin
  if v_day is null then return; end if;
  if exists (select 1 from marketplace_health_private.runs
     where run_date = v_day and source = 'scheduled'
       and (status = 'succeeded' or attempts >= 3
         or (status = 'running' and started_at > statement_timestamp() - interval '5 minutes'))) then
    return;
  end if;
  select decrypted_secret into strict v_url from vault.decrypted_secrets where name = 'marketplace_health_url';
  select decrypted_secret into strict v_secret from vault.decrypted_secrets where name = 'marketplace_health_cron_secret';
  perform net.http_post(url := v_url, headers := jsonb_build_object(
    'Content-Type', 'application/json', 'x-marketplace-health-secret', v_secret
  ), body := '{}'::jsonb, timeout_milliseconds := 30000);
end;
$$;

revoke execute on all functions in schema marketplace_health_private from public, anon, authenticated, service_role;
revoke all on function public.marketplace_health_claim(text),
  public.marketplace_health_finish(date, text, uuid),
  public.marketplace_health_history(date, text) from public, anon, authenticated, service_role;
grant execute on function public.marketplace_health_claim(text),
  public.marketplace_health_finish(date, text, uuid) to service_role;
grant execute on function public.marketplace_health_history(date, text) to authenticated;
