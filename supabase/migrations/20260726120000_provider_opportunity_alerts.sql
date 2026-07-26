-- Selective provider opportunity alerts.
--
-- Providers explicitly choose instant strong matches, a daily summary, or off.
-- Matching uses the shared category/capability taxonomy, provider location and
-- radius, availability, job timing, and (when supplied) equipment/licences.

alter table public.user_preferences
  add column if not exists opportunity_alert_mode text not null default 'off',
  add column if not exists opportunity_radius_km integer not null default 30,
  add column if not exists opportunity_available boolean not null default true,
  add column if not exists opportunity_push boolean not null default true,
  add column if not exists opportunity_email boolean not null default false;

alter table public.user_preferences
  drop constraint if exists user_preferences_opportunity_alert_mode_check;
alter table public.user_preferences
  add constraint user_preferences_opportunity_alert_mode_check
  check (opportunity_alert_mode in ('instant', 'daily', 'off'));

alter table public.user_preferences
  drop constraint if exists user_preferences_opportunity_radius_km_check;
alter table public.user_preferences
  add constraint user_preferences_opportunity_radius_km_check
  check (opportunity_radius_km between 5 and 200);

alter table public.profiles
  add column if not exists equipment text[] not null default '{}';

alter table public.jobs
  add column if not exists required_capabilities text[] not null default '{}',
  add column if not exists equipment_requirements text[] not null default '{}',
  add column if not exists licence_requirements text[] not null default '{}';

create table if not exists public.opportunity_matches (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.jobs(id) on delete cascade,
  provider_id    uuid not null references public.profiles(id) on delete cascade,
  score          integer not null,
  distance_km    numeric(7,2) not null,
  reasons        text[] not null default '{}',
  notified_at    timestamptz,
  digested_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (job_id, provider_id)
);

create index if not exists opportunity_matches_provider_idx
  on public.opportunity_matches (provider_id, created_at desc);
create index if not exists opportunity_matches_daily_idx
  on public.opportunity_matches (provider_id, created_at)
  where digested_at is null;

alter table public.opportunity_matches enable row level security;
revoke all on public.opportunity_matches from anon;
revoke insert, update, delete on public.opportunity_matches from authenticated;
grant select on public.opportunity_matches to authenticated;
grant all on public.opportunity_matches to service_role;

drop policy if exists "Providers can view own opportunity matches" on public.opportunity_matches;
create policy "Providers can view own opportunity matches"
  on public.opportunity_matches for select
  to authenticated
  using (provider_id = auth.uid());

create or replace function public.category_capabilities(p_category text)
returns text[]
language sql
immutable
parallel safe
as $$
  select case p_category
    when 'Fencing & Gates' then array[
      'New rural fencing', 'Fence repairs', 'Electric fencing',
      'Gate installation and repairs', 'Post driving'
    ]
    when 'Animals & Farm Sitting' then array[
      'General animal care', 'Animal feeding', 'Stock checks',
      'Farm or lifestyle-block sitting', 'Livestock handling and moving'
    ]
    when 'Water & Drainage' then array[
      'Trough installation and repairs', 'Pipes and water-line repairs',
      'Water-tank installation and repairs', 'Pump installation and repairs',
      'Drainage and culvert work'
    ]
    when 'Spraying & Pest Control' then array[
      'Weed spraying', 'Gorse and scrub spraying', 'Crop spraying',
      'Fertiliser spreading', 'Rural pest control'
    ]
    when 'Land & Vegetation' then array[
      'Mowing, slashing, and topping', 'Hedge and shelterbelt trimming',
      'Tree pruning and removal', 'Scrub and section clearing',
      'Firewood cutting and splitting'
    ]
    when 'Cropping, Hay & Feed' then array[
      'Cultivation and sowing', 'Harvesting', 'Hay and silage baling',
      'Mowing and raking', 'Feed and supplement supply'
    ]
    when 'Earthworks & Driveways' then array[
      'Driveway grading and repairs', 'Gravel spreading',
      'Digger and excavation work', 'Track construction and maintenance',
      'Trenching and drainage work'
    ]
    when 'Machinery & Repairs' then array[
      'Tractor work', 'Machinery hire with operator',
      'Farm-machinery servicing and repairs', 'Small-engine repairs',
      'Welding and fabrication'
    ]
    when 'Buildings & Maintenance' then array[
      'General property maintenance', 'Shed construction and repairs',
      'Carpentry', 'Roofing and gutter repairs', 'Painting and water blasting'
    ]
    when 'Transport & Delivery' then array[
      'General rural delivery', 'Hay and feed delivery',
      'Machinery and equipment transport', 'Livestock transport',
      'Towing and vehicle recovery'
    ]
    when 'Property & House Sitting' then array[
      'House sitting', 'Property and security checks', 'Lifestyle-block checks',
      'Garden watering and basic care', 'Holiday property care'
    ]
    when 'General Rural Help' then array[
      'General farm labour', 'Seasonal work', 'Property and yard cleanup',
      'Lifting, loading, and moving', 'Short-notice help'
    ]
    else '{}'::text[]
  end;
$$;

create or replace function public.rural_distance_km(
  p_latitude_a numeric,
  p_longitude_a numeric,
  p_latitude_b numeric,
  p_longitude_b numeric
)
returns numeric
language sql
immutable
parallel safe
returns null on null input
as $$
  select 6371 * 2 * asin(
    sqrt(
      power(sin(radians((p_latitude_b - p_latitude_a)::double precision) / 2), 2)
      + cos(radians(p_latitude_a::double precision))
      * cos(radians(p_latitude_b::double precision))
      * power(sin(radians((p_longitude_b - p_longitude_a)::double precision) / 2), 2)
    )
  );
$$;

-- Internal view of providers that meet every hard requirement. Keeping the
-- candidate calculation in one place ensures instant and daily alerts agree.
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
    pref.opportunity_radius_km || ' km travel area'
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
  and (
    j.date_to is null
    or j.date_to >= current_date
  )
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
      candidate.job_title || ' · ' || round(candidate.distance_km)::integer
        || ' km away. ' || array_to_string(candidate.reasons, ' · ') || '.',
      jsonb_build_object(
        'job_id', candidate.job_id,
        'distance_km', round(candidate.distance_km, 1),
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

create or replace function public.refresh_opportunity_matches_for_job(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  matched integer := 0;
begin
  delete from public.opportunity_matches m
   where m.job_id = p_job_id
     and not exists (
       select 1 from public.opportunity_candidates c
        where c.job_id = m.job_id and c.provider_id = m.provider_id
     );

  insert into public.opportunity_matches (
    job_id, provider_id, score, distance_km, reasons
  )
  select job_id, provider_id, score, distance_km, reasons
    from public.opportunity_candidates
   where job_id = p_job_id
  on conflict (job_id, provider_id) do update
    set score = excluded.score,
        distance_km = excluded.distance_km,
        reasons = excluded.reasons,
        updated_at = now();

  get diagnostics matched = row_count;
  perform public.deliver_instant_opportunity_matches(p_job_id, null);
  return matched;
end;
$$;

create or replace function public.refresh_opportunity_matches_for_provider(p_provider_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  matched integer := 0;
begin
  delete from public.opportunity_matches m
   where m.provider_id = p_provider_id
     and not exists (
       select 1 from public.opportunity_candidates c
        where c.job_id = m.job_id and c.provider_id = m.provider_id
     );

  insert into public.opportunity_matches (
    job_id, provider_id, score, distance_km, reasons
  )
  select job_id, provider_id, score, distance_km, reasons
    from public.opportunity_candidates
   where provider_id = p_provider_id
  on conflict (job_id, provider_id) do update
    set score = excluded.score,
        distance_km = excluded.distance_km,
        reasons = excluded.reasons,
        updated_at = now();

  get diagnostics matched = row_count;
  perform public.deliver_instant_opportunity_matches(null, p_provider_id);
  return matched;
end;
$$;

create or replace function public.on_job_refresh_opportunities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_opportunity_matches_for_job(new.id);
  return new;
exception when others then
  raise warning 'Could not refresh opportunity matches for job %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists jobs_refresh_opportunities on public.jobs;
create trigger jobs_refresh_opportunities
  after insert or update of status, visibility, category, latitude, longitude,
    schedule_type, scheduled_date, date_to, required_capabilities,
    equipment_requirements, licence_requirements
  on public.jobs
  for each row execute function public.on_job_refresh_opportunities();

create or replace function public.on_provider_refresh_opportunities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_opportunity_matches_for_provider(new.id);
  return new;
exception when others then
  raise warning 'Could not refresh opportunity matches for provider %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists profiles_refresh_opportunities on public.profiles;
create trigger profiles_refresh_opportunities
  after update of primary_role, role, skills, qualifications, equipment, latitude, longitude
  on public.profiles
  for each row execute function public.on_provider_refresh_opportunities();

create or replace function public.on_opportunity_preferences_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_opportunity_matches_for_provider(new.user_id);
  return new;
exception when others then
  raise warning 'Could not refresh opportunity matches for provider %: %', new.user_id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists preferences_refresh_opportunities on public.user_preferences;
create trigger preferences_refresh_opportunities
  after insert or update of opportunity_alert_mode, opportunity_radius_km,
    opportunity_available
  on public.user_preferences
  for each row execute function public.on_opportunity_preferences_refresh();

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
    join public.user_preferences pref on pref.user_id = m.provider_id
    where pref.opportunity_alert_mode = 'daily'
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

revoke all on function public.deliver_instant_opportunity_matches(uuid, uuid) from public;
revoke all on function public.refresh_opportunity_matches_for_job(uuid) from public;
revoke all on function public.refresh_opportunity_matches_for_provider(uuid) from public;
revoke all on function public.queue_daily_opportunity_digests() from public;
grant execute on function public.queue_daily_opportunity_digests() to service_role;

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'queue-daily-opportunity-digests';

select cron.schedule(
  'queue-daily-opportunity-digests',
  '0 20 * * *',
  $$select public.queue_daily_opportunity_digests();$$
);

-- Add opportunity email to the existing notification outbox, independently
-- from transactional email preferences.
create or replace function public.enqueue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transactional boolean := true;
  v_messages boolean := true;
  v_opportunity_email boolean := false;
  v_send_at timestamptz := now();
begin
  if new.type not in (
    'new_bid', 'new_booking', 'new_job_invite', 'new_question',
    'question_answered', 'bid_accepted', 'job_cancelled', 'job_ready',
    'job_completed', 'service_quote_sent', 'service_quote_accepted',
    'booking_confirmed', 'booking_declined', 'booking_cancelled',
    'service_booking_withdrawn', 'booking_ready', 'booking_completed',
    'booking_cancellation_requested', 'new_message',
    'opportunity_match', 'opportunity_digest'
  ) then
    return new;
  end if;

  select p.email_transactional, p.email_messages, p.opportunity_email
    into v_transactional, v_messages, v_opportunity_email
    from public.user_preferences p
   where p.user_id = new.user_id;

  v_transactional := coalesce(v_transactional, true);
  v_messages := coalesce(v_messages, true);
  v_opportunity_email := coalesce(v_opportunity_email, false);

  if new.type in ('opportunity_match', 'opportunity_digest') then
    if not v_opportunity_email then return new; end if;
  elsif new.type = 'new_message' then
    if not v_messages then return new; end if;
    v_send_at := now() + interval '20 minutes';
  elsif not v_transactional then
    return new;
  end if;

  insert into public.email_outbox (
    user_id, notification_id, email_type, scheduled_for
  ) values (
    new.user_id, new.id, new.type, v_send_at
  ) on conflict (notification_id) do nothing;

  return new;
exception when others then
  raise warning 'Could not enqueue notification email %: %', new.id, sqlerrm;
  return new;
end;
$$;
