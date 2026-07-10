-- ────────────────────────────────────────────────────────────────────────────
-- Apply the schema/policy changes from recent feature work.
-- Paste the whole file into the Supabase SQL editor and run once.
-- Every statement is idempotent (if-not-exists / drop-if-exists), so it's safe
-- to run again if you're unsure what's already applied.
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Daily summary opt-in (Account → Daily summary)
alter table public.user_preferences
  add column if not exists daily_digest boolean not null default false;

-- 2. Service materials policy (CreateService pricing step)
alter table public.services
  add column if not exists materials text;

-- 3. Provider offer (bid) pricing basis + materials
alter table public.bids
  add column if not exists pricing_type text;
alter table public.bids
  add column if not exists materials text;

-- 4. Private offers — an offer is visible only to its provider and the job owner.
--    Replaces the old "Anyone can view bids" policy (USING true).
drop policy if exists "Anyone can view bids" on public.bids;
drop policy if exists "Offers visible to provider and job owner" on public.bids;
create policy "Offers visible to provider and job owner"
  on public.bids
  for select
  using (
    auth.uid() = provider_id
    or auth.uid() = (select requester_id from public.jobs where jobs.id = bids.job_id)
  );

-- 5. Lock down profiles PII.
--    Base table becomes owner-only; a non-sensitive public view backs all
--    cross-user reads (names/avatars/bios/region). Phone/address/GPS/is_admin
--    are never exposed to other users.
drop view if exists public.profiles_public;
create view public.profiles_public
  with (security_invoker = false) as
  select
    id, full_name, display_name, avatar_url, bio,
    skills, qualifications, region, primary_role, role, created_at
  from public.profiles;

grant select on public.profiles_public to anon, authenticated;

alter table public.profiles enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.profiles', pol.policyname);
  end loop;
end $$;

create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

-- 6. Connections — the people you've completed work with (jobs + bookings).
--    Derived, self-filtering view powering the Connections surfaces.
drop view if exists public.connections;
create view public.connections
  with (security_invoker = false) as
  with engagements as (
    select j.requester_id, b.provider_id, 'job'::text as kind,
           j.category as category, j.created_at as engaged_at
    from public.jobs j
    join public.bids b on b.job_id = j.id and b.status = 'accepted'
    where j.status = 'completed' and j.requester_id is not null and b.provider_id is not null
    union all
    select bk.requester_id, bk.provider_id, 'booking'::text as kind,
           s.category as category, bk.created_at as engaged_at
    from public.bookings bk
    left join public.services s on s.id = bk.service_id
    where bk.status = 'completed' and bk.requester_id is not null and bk.provider_id is not null
  )
  select
    e.requester_id, e.provider_id,
    count(*)::int as times_worked,
    count(*) filter (where e.kind = 'job')::int as jobs_count,
    count(*) filter (where e.kind = 'booking')::int as bookings_count,
    max(e.engaged_at) as last_engaged_at,
    min(e.engaged_at) as first_engaged_at,
    array_remove(array_agg(distinct e.category), null) as categories
  from engagements e
  where auth.uid() in (e.requester_id, e.provider_id)
  group by e.requester_id, e.provider_id;

grant select on public.connections to authenticated;

-- 7. Direct private job offers — a requester can offer a job straight to a
--    connection. Invite-only jobs stay off the public board.
alter table public.jobs
  add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'invite_only'));

create table if not exists public.job_invites (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  requester_id uuid not null,
  provider_id  uuid not null,
  status       text not null default 'pending' check (status in ('pending', 'seen', 'declined')),
  created_at   timestamptz not null default timezone('utc', now()),
  unique (job_id, provider_id)
);
create index if not exists job_invites_provider_idx on public.job_invites(provider_id);

alter table public.job_invites enable row level security;

drop policy if exists "Invites visible to provider and requester" on public.job_invites;
create policy "Invites visible to provider and requester"
  on public.job_invites for select
  using (auth.uid() = provider_id or auth.uid() = requester_id);

drop policy if exists "Requester can invite to own jobs" on public.job_invites;
create policy "Requester can invite to own jobs"
  on public.job_invites for insert
  with check (
    auth.uid() = requester_id
    and exists (select 1 from public.jobs j where j.id = job_id and j.requester_id = auth.uid())
  );

drop policy if exists "Provider can update own invite" on public.job_invites;
create policy "Provider can update own invite"
  on public.job_invites for update
  using (auth.uid() = provider_id)
  with check (auth.uid() = provider_id);

grant select, insert, update on public.job_invites to authenticated;

drop policy if exists "Anyone can view open jobs" on public.jobs;
drop policy if exists "Jobs are viewable by audience" on public.jobs;
create policy "Jobs are viewable by audience"
  on public.jobs for select
  using (
    visibility = 'public'
    or requester_id = auth.uid()
    or exists (
      select 1 from public.job_invites ji
      where ji.job_id = jobs.id and ji.provider_id = auth.uid()
    )
  );

create or replace function public.notify_job_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text; v_name text;
begin
  select title into v_title from public.jobs where id = NEW.job_id;
  select coalesce(display_name, full_name, 'Someone') into v_name
    from public.profiles where id = NEW.requester_id;
  insert into public.notifications (user_id, type, title, body, metadata)
  values (
    NEW.provider_id, 'new_job_invite', 'New job offer',
    v_name || ' invited you to a job: ' || coalesce(v_title, 'a job'),
    jsonb_build_object('job_id', NEW.job_id, 'sender_id', NEW.requester_id)
  );
  return NEW;
end; $$;

drop trigger if exists trg_notify_job_invite on public.job_invites;
create trigger trg_notify_job_invite
  after insert on public.job_invites
  for each row execute function public.notify_job_invite();

-- 8. Break the jobs/bids/job_invites RLS recursion (fixes "infinite recursion
--    detected in policy for relation jobs" when accepting an offer). Move each
--    cross-table check into a SECURITY DEFINER helper so policies never re-enter
--    another table's RLS. Supersedes the policy forms created in 4 and 7 above.
create or replace function public.job_owner_id(p_job_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select requester_id from public.jobs where id = p_job_id;
$$;

create or replace function public.is_accepted_provider(p_job_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bids
    where job_id = p_job_id and provider_id = auth.uid() and status = 'accepted');
$$;

create or replace function public.is_invited_to_job(p_job_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.job_invites
    where job_id = p_job_id and provider_id = auth.uid());
$$;

grant execute on function public.job_owner_id(uuid) to anon, authenticated;
grant execute on function public.is_accepted_provider(uuid) to anon, authenticated;
grant execute on function public.is_invited_to_job(uuid) to anon, authenticated;

drop policy if exists "Offers visible to provider and job owner" on public.bids;
create policy "Offers visible to provider and job owner"
  on public.bids for select
  using (auth.uid() = provider_id or auth.uid() = public.job_owner_id(job_id));

drop policy if exists "Accepted provider can mark awaiting completion" on public.jobs;
create policy "Accepted provider can mark awaiting completion"
  on public.jobs for update to authenticated
  using (status in ('accepted', 'in_progress') and public.is_accepted_provider(id))
  with check (status = 'awaiting_completion' and public.is_accepted_provider(id));

drop policy if exists "Jobs are viewable by audience" on public.jobs;
create policy "Jobs are viewable by audience"
  on public.jobs for select
  using (
    visibility = 'public'
    or requester_id = auth.uid()
    or public.is_invited_to_job(id)
  );

-- 9. Security fix pack (July 2026 review).
--    a) CRITICAL: block is_admin self-promotion via the own-profile UPDATE
--    b) HIGH: drop legacy "Anyone can insert notifications" (triggers create them)
--    c) MEDIUM: job_invites — providers may only update `status`
--    d) MEDIUM: bids — only the job owner changes offer status; job_id immutable
create or replace function public.protect_profile_privileged_cols()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin then
    if auth.uid() is not null and not public.current_user_is_admin() then
      raise exception 'is_admin can only be changed by an administrator';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_protect_profile_privileged on public.profiles;
create trigger trg_protect_profile_privileged
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_cols();

drop policy if exists "Anyone can insert notifications" on public.notifications;

revoke update on public.job_invites from authenticated;
grant update (status) on public.job_invites to authenticated;

create or replace function public.protect_bid_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.job_id is distinct from old.job_id then
    raise exception 'An offer cannot be moved to a different job';
  end if;
  if new.status is distinct from old.status then
    if auth.uid() is not null and auth.uid() <> public.job_owner_id(new.job_id) then
      raise exception 'Only the job owner can change an offer''s status';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_protect_bid_integrity on public.bids;
create trigger trg_protect_bid_integrity
  before update on public.bids
  for each row execute function public.protect_bid_integrity();

-- 10. House-sitting + two-tier job location privacy. New job fields, an
--     "unpaid" price type, and a masking view (jobs_public) that hides the exact
--     location from the public board when a job opts in — revealing it only to
--     the owner and the accepted provider.
alter table public.jobs add column if not exists hide_exact_location boolean not null default false;
alter table public.jobs add column if not exists location_area text;
alter table public.jobs add column if not exists date_from date;
alter table public.jobs add column if not exists date_to   date;

alter table public.jobs drop constraint if exists jobs_price_type_check;
alter table public.jobs add constraint jobs_price_type_check
  check (price_type = any (array['fixed'::text, 'open'::text, 'unpaid'::text]));

create or replace function public.can_see_job_location(p_job_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when coalesce((select hide_exact_location from public.jobs where id = p_job_id), false) = false then true
    when auth.uid() = (select requester_id from public.jobs where id = p_job_id) then true
    when public.is_accepted_provider(p_job_id) then true
    else false
  end;
$$;
grant execute on function public.can_see_job_location(uuid) to anon, authenticated;

drop view if exists public.jobs_public;
create view public.jobs_public with (security_invoker = true) as
  select
    j.id, j.requester_id, j.title, j.description, j.category,
    j.price_type, j.price, j.status, j.visibility,
    j.hide_exact_location, j.location_area,
    j.schedule_type, j.scheduled_date, j.date_from, j.date_to,
    j.materials_type, j.access_conditions, j.photos, j.area_hectares,
    j.cancellation_reason, j.cancellation_note, j.created_at,
    case when public.can_see_job_location(j.id) then j.location_name else null end as location_name,
    case when public.can_see_job_location(j.id) then j.latitude      else null end as latitude,
    case when public.can_see_job_location(j.id) then j.longitude     else null end as longitude,
    case when public.can_see_job_location(j.id) then j.location_note else null end as location_note,
    case when public.can_see_job_location(j.id) then j.area_polygon  else null end as area_polygon
  from public.jobs j;

grant select on public.jobs_public to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- After running: reload the app. Offers are now private end-to-end, the
-- service/offer materials + pricing fields save correctly, and no user can
-- read another user's phone/address/GPS via the API.
--
-- IMPORTANT: this matched-set of app changes (cross-user reads now hit
-- profiles_public) ships with this commit — run this SQL and update the app
-- together, or cross-user names/avatars will read empty until both are live.
-- ────────────────────────────────────────────────────────────────────────────
