-- Time-aware provider availability used by matching and public profiles.

alter table public.profiles
  add column if not exists availability_status text not null default 'unknown',
  add column if not exists availability_until date,
  add column if not exists availability_updated_at timestamptz,
  add column if not exists availability_prompted_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_availability_status_check;
alter table public.profiles
  add constraint profiles_availability_status_check
  check (availability_status in (
    'unknown', 'available_now', 'available_this_week', 'limited', 'unavailable_until'
  ));

-- Preserve active opportunity-alert users as available during rollout, while
-- avoiding a public "available" claim for providers who never opted into leads.
update public.profiles p
   set availability_status = case
         when pref.opportunity_available then 'available_now'
         else 'unknown'
       end,
       availability_updated_at = case
         when pref.opportunity_available then now()
         else null
       end
  from public.user_preferences pref
 where pref.user_id = p.id
   and pref.opportunity_alert_mode <> 'off'
   and p.availability_status = 'unknown';

create or replace function public.provider_is_available(p public.profiles)
returns boolean
language sql
stable
parallel safe
as $$
  select case p.availability_status
    when 'available_now' then
      p.availability_updated_at >= now() - interval '7 days'
    when 'available_this_week' then
      p.availability_updated_at is not null
      and now() < date_trunc('week', p.availability_updated_at) + interval '7 days'
    when 'limited' then
      p.availability_updated_at >= now() - interval '14 days'
    else false
  end;
$$;

-- Public projection remains PII-safe; only the provider's declared work
-- availability is added.
create or replace view public.profiles_public
  with (security_invoker = false) as
  select
    id,
    full_name,
    display_name,
    avatar_url,
    bio,
    skills,
    qualifications,
    region,
    primary_role,
    role,
    created_at,
    availability_status,
    availability_until,
    availability_updated_at
  from public.profiles;

grant select on public.profiles_public to anon, authenticated;

create or replace view public.opportunity_candidates
with (security_invoker = false)
as
select
  j.id as job_id,
  p.id as provider_id,
  pref.opportunity_alert_mode,
  pref.opportunity_radius_km,
  public.rural_distance_km(p.latitude, p.longitude, j.latitude, j.longitude) as distance_km,
  least(
    100,
    70
      + case when cardinality(j.required_capabilities) > 0 then 15 else 0 end
      + case when cardinality(j.equipment_requirements) > 0 then 5 else 0 end
      + case when cardinality(j.licence_requirements) > 0 then 10 else 0 end
  )::integer as score,
  array_remove(array[
    'Matches your ' || coalesce(
      (
        select lower(skill)
          from unnest(coalesce(p.skills, '{}')) skill
         where skill = any(
           case
             when cardinality(j.required_capabilities) > 0 then j.required_capabilities
             else public.category_capabilities(j.category)
           end
         )
         limit 1
      ),
      lower(j.category)
    ) || ' capability',
    pref.opportunity_radius_km || ' km travel area',
    case p.availability_status
      when 'available_now' then 'Available now'
      when 'available_this_week' then 'Available this week'
      when 'limited' then 'Limited availability'
      else null
    end
  ], null)::text[] as reasons
from public.jobs j
join public.profiles p
  on p.id <> j.requester_id
join public.user_preferences pref
  on pref.user_id = p.id
cross join lateral (
  select public.rural_distance_km(p.latitude, p.longitude, j.latitude, j.longitude) as km
) d
where j.status = 'open'
  and coalesce(j.visibility, 'public') = 'public'
  and coalesce(p.primary_role, p.role, 'requester') in ('provider', 'both')
  and pref.opportunity_alert_mode in ('instant', 'daily')
  and pref.opportunity_available
  and public.provider_is_available(p)
  and p.latitude is not null
  and p.longitude is not null
  and j.latitude is not null
  and j.longitude is not null
  and d.km <= pref.opportunity_radius_km
  and (
    cardinality(j.required_capabilities) > 0
    and coalesce(p.skills, '{}') && j.required_capabilities
    or cardinality(j.required_capabilities) = 0
    and coalesce(p.skills, '{}') && public.category_capabilities(j.category)
  )
  and (
    j.schedule_type <> 'specific'
    or j.scheduled_date is null
    or j.scheduled_date::date >= current_date
  )
  and (j.date_to is null or j.date_to >= current_date)
  and not exists (
    select 1
      from unnest(j.equipment_requirements) required
     where not exists (
       select 1 from unnest(coalesce(p.equipment, '{}')) supplied
        where lower(trim(supplied)) = lower(trim(required))
     )
  )
  and not exists (
    select 1
      from unnest(j.licence_requirements) required
     where not exists (
       select 1 from unnest(coalesce(p.qualifications, '{}')) supplied
        where lower(trim(supplied)) = lower(trim(required))
     )
  );

revoke all on public.opportunity_candidates from anon, authenticated;

create or replace function public.on_provider_availability_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Keep the retired boolean coherent for older app builds.
  update public.user_preferences
     set opportunity_available = public.provider_is_available(new)
   where user_id = new.id;
  perform public.refresh_opportunity_matches_for_provider(new.id);
  return new;
exception when others then
  raise warning 'Could not refresh availability matches for provider %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists profiles_refresh_availability_matches on public.profiles;
create trigger profiles_refresh_availability_matches
  after update of availability_status, availability_until, availability_updated_at
  on public.profiles
  for each row execute function public.on_provider_availability_refresh();

create or replace function public.queue_weekly_availability_checks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  provider record;
  queued integer := 0;
begin
  for provider in
    select p.id, coalesce(nullif(trim(p.region), ''), 'your area') as area
      from public.profiles p
      join public.user_preferences pref on pref.user_id = p.id
     where coalesce(p.primary_role, p.role, 'requester') in ('provider', 'both')
       and pref.opportunity_alert_mode <> 'off'
       and (p.availability_prompted_at is null or p.availability_prompted_at < now() - interval '6 days')
  loop
    insert into public.notifications (user_id, type, title, body, metadata)
    values (
      provider.id,
      'availability_check',
      'Are you available this week?',
      'Are you available for work around ' || provider.area || ' this week?',
      jsonb_build_object('availability_prompt', true)
    );
    update public.profiles
       set availability_prompted_at = now()
     where id = provider.id;
    queued := queued + 1;
  end loop;
  return queued;
end;
$$;

revoke all on function public.queue_weekly_availability_checks() from public;
grant execute on function public.queue_weekly_availability_checks() to service_role;

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'queue-weekly-provider-availability-checks';

-- Monday 20:30 UTC = Tuesday morning in New Zealand.
select cron.schedule(
  'queue-weekly-provider-availability-checks',
  '30 20 * * 1',
  $$select public.queue_weekly_availability_checks();$$
);
