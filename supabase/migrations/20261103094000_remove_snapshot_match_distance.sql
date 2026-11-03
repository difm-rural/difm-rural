-- Match alerts must not present a stored exact-pin distance as current browsing distance.
-- Existing records are left intact; clients handle legacy alert text.
create or replace function public.deliver_instant_opportunity_matches(
  p_job_id uuid default null,
  p_provider_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  delivered integer := 0;
  v_notification_id uuid;
begin
  for candidate in
    select m.id, m.job_id, m.provider_id, m.distance_km, m.reasons,
           j.title as job_title
      from public.opportunity_matches m
      join public.jobs j on j.id = m.job_id
      join public.user_preferences pref on pref.user_id = m.provider_id
     where m.notified_at is null
       and pref.opportunity_alert_mode = 'instant'
       and (p_job_id is null or m.job_id = p_job_id)
       and (p_provider_id is null or m.provider_id = p_provider_id)
  loop
    insert into public.notifications (user_id, type, title, body, metadata)
    values (
      candidate.provider_id,
      'opportunity_match',
      'Strong job match',
      candidate.job_title || ' · ' || array_to_string(candidate.reasons, ' · ') || '.',
      jsonb_build_object(
        'job_id', candidate.job_id,
        'match_reasons', to_jsonb(candidate.reasons)
      )
    )
    returning id into v_notification_id;

    update public.opportunity_matches
       set notified_at = now(), updated_at = now()
     where id = candidate.id;
    delivered := delivered + 1;
  end loop;
  return delivered;
end;
$$;
