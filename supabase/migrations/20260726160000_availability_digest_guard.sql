-- Re-check availability when a daily opportunity digest is assembled. A
-- provider can become unavailable (or a short-term status can expire) after a
-- match row was created but before the morning summary runs.

create or replace function public.queue_daily_opportunity_digests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  provider_summary record;
  queued integer := 0;
begin
  for provider_summary in
    select
      m.provider_id,
      count(*)::integer as match_count,
      min(m.job_id::text)::uuid as first_job_id,
      min(j.title) as first_job_title,
      min(m.distance_km) as nearest_km
    from public.opportunity_matches m
    join public.jobs j on j.id = m.job_id
    join public.profiles p on p.id = m.provider_id
    join public.user_preferences pref on pref.user_id = m.provider_id
    where pref.opportunity_alert_mode = 'daily'
      and pref.opportunity_available
      and public.provider_is_available(p)
      and m.digested_at is null
      and m.created_at >= now() - interval '36 hours'
      and j.status = 'open'
    group by m.provider_id
  loop
    insert into public.notifications (user_id, type, title, body, metadata)
    values (
      provider_summary.provider_id,
      'opportunity_digest',
      'New jobs matching your capabilities',
      case
        when provider_summary.match_count = 1 then
          provider_summary.first_job_title || ' · '
            || round(provider_summary.nearest_km)::integer || ' km away.'
        else
          provider_summary.match_count || ' suitable jobs are available. The nearest is '
            || round(provider_summary.nearest_km)::integer || ' km away.'
      end,
      jsonb_build_object(
        'job_id', provider_summary.first_job_id,
        'match_count', provider_summary.match_count
      )
    );

    update public.opportunity_matches
       set digested_at = now(), updated_at = now()
     where provider_id = provider_summary.provider_id
       and digested_at is null
       and created_at >= now() - interval '36 hours';
    queued := queued + 1;
  end loop;
  return queued;
end;
$$;

revoke all on function public.queue_daily_opportunity_digests() from public;
grant execute on function public.queue_daily_opportunity_digests() to service_role;
