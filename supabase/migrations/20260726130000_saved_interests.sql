-- Explicit, user-owned interests and saved job searches.
--
-- Browsing behaviour is deliberately not converted into alerts. Each row is
-- created by the user, has its own delivery frequency/channels, and is paused
-- after six months without app activity.

create table if not exists public.saved_interests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  kind             text not null,
  name             text not null,
  filter_key       text not null,
  query            text,
  category         text,
  capability       text,
  location_name    text,
  latitude         numeric(9,6),
  longitude        numeric(9,6),
  radius_km        integer,
  provider_id      uuid references public.profiles(id) on delete cascade,
  recurring_work   text,
  frequency        text not null default 'instant',
  push_enabled     boolean not null default true,
  email_enabled    boolean not null default false,
  active           boolean not null default true,
  last_engaged_at  timestamptz not null default now(),
  auto_paused_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, filter_key),
  constraint saved_interests_kind_check check (
    kind in ('saved_search', 'category', 'capability', 'location', 'provider', 'recurring_work')
  ),
  constraint saved_interests_frequency_check check (frequency in ('instant', 'daily', 'off')),
  constraint saved_interests_radius_check check (radius_km is null or radius_km between 1 and 200),
  constraint saved_interests_coordinates_check check (
    (latitude is null and longitude is null) or
    (latitude between -90 and 90 and longitude between -180 and 180)
  )
);

create index if not exists saved_interests_matching_idx
  on public.saved_interests (active, frequency, kind);
create index if not exists saved_interests_provider_idx
  on public.saved_interests (provider_id) where provider_id is not null;

alter table public.saved_interests enable row level security;
revoke all on public.saved_interests from anon;
grant select, insert, update, delete on public.saved_interests to authenticated;
grant all on public.saved_interests to service_role;

drop policy if exists "Users manage their saved interests" on public.saved_interests;
create policy "Users manage their saved interests"
  on public.saved_interests for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.saved_interest_matches (
  id                 uuid primary key default gen_random_uuid(),
  saved_interest_id  uuid not null references public.saved_interests(id) on delete cascade,
  user_id            uuid not null references public.profiles(id) on delete cascade,
  job_id             uuid not null references public.jobs(id) on delete cascade,
  notified_at        timestamptz,
  digested_at        timestamptz,
  created_at         timestamptz not null default now(),
  unique (saved_interest_id, job_id)
);

create index if not exists saved_interest_matches_daily_idx
  on public.saved_interest_matches (user_id, created_at)
  where digested_at is null;

alter table public.saved_interest_matches enable row level security;
revoke all on public.saved_interest_matches from anon;
revoke insert, update, delete on public.saved_interest_matches from authenticated;
grant select on public.saved_interest_matches to authenticated;
grant all on public.saved_interest_matches to service_role;

drop policy if exists "Users view their saved interest matches" on public.saved_interest_matches;
create policy "Users view their saved interest matches"
  on public.saved_interest_matches for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.saved_interest_matches_job(
  interest public.saved_interests,
  job public.jobs
)
returns boolean
language sql
stable
parallel safe
as $$
  select
    interest.active
    and interest.frequency <> 'off'
    and job.status = 'open'
    and coalesce(job.visibility, 'public') = 'public'
    and job.requester_id <> interest.user_id
    and (interest.category is null or job.category = interest.category)
    and (
      interest.capability is null
      or interest.capability = any(coalesce(job.required_capabilities, '{}'))
      or interest.capability = any(public.category_capabilities(job.category))
    )
    and (
      nullif(trim(interest.query), '') is null
      or to_tsvector(
        'english',
        concat_ws(' ', job.title, job.description, job.category, job.location_name)
      ) @@ websearch_to_tsquery('english', trim(interest.query))
    )
    and (
      interest.recurring_work is null
      or concat_ws(' ', job.title, job.description, job.category)
          ilike '%' || interest.recurring_work || '%'
    )
    and (
      interest.radius_km is null
      or public.rural_distance_km(
        interest.latitude, interest.longitude, job.latitude, job.longitude
      ) <= interest.radius_km
    );
$$;

create or replace function public.refresh_saved_interest_matches_for_job(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
  candidate record;
  inserted_count integer := 0;
  v_match_id uuid;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if not found then return 0; end if;

  delete from public.saved_interest_matches m
   using public.saved_interests i
   where m.saved_interest_id = i.id
     and m.job_id = p_job_id
     and not public.saved_interest_matches_job(i, v_job);

  for candidate in
    select i.*
      from public.saved_interests i
     where public.saved_interest_matches_job(i, v_job)
  loop
    insert into public.saved_interest_matches (saved_interest_id, user_id, job_id)
    values (candidate.id, candidate.user_id, p_job_id)
    on conflict (saved_interest_id, job_id) do nothing
    returning id into v_match_id;

    if v_match_id is not null then
      inserted_count := inserted_count + 1;
      if candidate.frequency = 'instant' then
        insert into public.notifications (user_id, type, title, body, metadata)
        values (
          candidate.user_id,
          'saved_interest_match',
          'New job matching ' || candidate.name,
          v_job.title || case
            when candidate.location_name is not null then ' · near ' || candidate.location_name
            else ''
          end,
          jsonb_build_object(
            'job_id', v_job.id,
            'saved_interest_id', candidate.id,
            'saved_interest_name', candidate.name
          )
        );
        update public.saved_interest_matches
           set notified_at = now()
         where id = v_match_id;
      end if;
    end if;
    v_match_id := null;
  end loop;
  return inserted_count;
end;
$$;

create or replace function public.on_job_refresh_saved_interests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_saved_interest_matches_for_job(new.id);
  return new;
exception when others then
  raise warning 'Could not refresh saved interests for job %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists jobs_refresh_saved_interests on public.jobs;
create trigger jobs_refresh_saved_interests
  after insert or update of status, visibility, title, description, category,
    location_name, latitude, longitude, required_capabilities
  on public.jobs
  for each row execute function public.on_job_refresh_saved_interests();

create or replace function public.queue_daily_saved_interest_digests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  summary record;
  queued integer := 0;
begin
  -- Notification hygiene: do not continue emailing people who have stopped
  -- using the app. A user can resume any auto-paused interest in Account.
  update public.saved_interests i
     set active = false, auto_paused_at = now(), updated_at = now()
   where i.active
     and coalesce(
       (select p.last_seen_at from public.user_preferences p where p.user_id = i.user_id),
       i.last_engaged_at,
       i.created_at
     ) < now() - interval '180 days';

  for summary in
    select
      i.id as interest_id,
      i.user_id,
      i.name,
      count(*)::integer as match_count,
      min(m.job_id::text)::uuid as first_job_id,
      min(j.title) as first_job_title
    from public.saved_interests i
    join public.saved_interest_matches m on m.saved_interest_id = i.id
    join public.jobs j on j.id = m.job_id
    where i.active
      and i.frequency = 'daily'
      and m.digested_at is null
      and m.created_at >= now() - interval '36 hours'
      and j.status = 'open'
    group by i.id, i.user_id, i.name
  loop
    insert into public.notifications (user_id, type, title, body, metadata)
    values (
      summary.user_id,
      'saved_interest_digest',
      'New matches for ' || summary.name,
      case when summary.match_count = 1
        then summary.first_job_title || ' matches your saved interest.'
        else summary.match_count || ' new jobs match your saved interest.'
      end,
      jsonb_build_object(
        'job_id', summary.first_job_id,
        'saved_interest_id', summary.interest_id,
        'saved_interest_name', summary.name,
        'match_count', summary.match_count
      )
    );

    update public.saved_interest_matches
       set digested_at = now()
     where saved_interest_id = summary.interest_id
       and digested_at is null
       and created_at >= now() - interval '36 hours';
    queued := queued + 1;
  end loop;
  return queued;
end;
$$;

revoke all on function public.refresh_saved_interest_matches_for_job(uuid) from public;
revoke all on function public.queue_daily_saved_interest_digests() from public;
grant execute on function public.queue_daily_saved_interest_digests() to service_role;

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'queue-daily-saved-interest-digests';

select cron.schedule(
  'queue-daily-saved-interest-digests',
  '15 20 * * *',
  $$select public.queue_daily_saved_interest_digests();$$
);

-- Add saved-interest notifications to the existing email outbox. Delivery is
-- still re-checked by the worker so pausing/deleting an interest cancels mail
-- that was queued but has not yet been sent.
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
  v_interest_email boolean := false;
  v_interest_frequency text;
  v_send_at timestamptz := now();
begin
  if new.type not in (
    'new_bid', 'new_booking', 'new_job_invite', 'new_question',
    'question_answered', 'bid_accepted', 'job_cancelled', 'job_ready',
    'job_completed', 'service_quote_sent', 'service_quote_accepted',
    'booking_confirmed', 'booking_declined', 'booking_cancelled',
    'service_booking_withdrawn', 'booking_ready', 'booking_completed',
    'booking_cancellation_requested', 'new_message',
    'opportunity_match', 'opportunity_digest',
    'saved_interest_match', 'saved_interest_digest'
  ) then return new; end if;

  select p.email_transactional, p.email_messages, p.opportunity_email
    into v_transactional, v_messages, v_opportunity_email
    from public.user_preferences p where p.user_id = new.user_id;

  if new.type in ('saved_interest_match', 'saved_interest_digest') then
    select i.email_enabled, i.frequency
      into v_interest_email, v_interest_frequency
      from public.saved_interests i
     where i.id = (new.metadata->>'saved_interest_id')::uuid
       and i.user_id = new.user_id and i.active;
    if not coalesce(v_interest_email, false)
       or v_interest_frequency <> (case when new.type = 'saved_interest_match' then 'instant' else 'daily' end)
    then return new; end if;
  elsif new.type in ('opportunity_match', 'opportunity_digest') then
    if not coalesce(v_opportunity_email, false) then return new; end if;
  elsif new.type = 'new_message' then
    if not coalesce(v_messages, true) then return new; end if;
    v_send_at := now() + interval '20 minutes';
  elsif not coalesce(v_transactional, true) then
    return new;
  end if;

  insert into public.email_outbox (user_id, notification_id, email_type, scheduled_for)
  values (new.user_id, new.id, new.type, v_send_at)
  on conflict (notification_id) do nothing;
  return new;
exception when others then
  raise warning 'Could not enqueue notification email %: %', new.id, sqlerrm;
  return new;
end;
$$;
