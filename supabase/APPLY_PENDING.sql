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

-- ────────────────────────────────────────────────────────────────────────────
-- After running: reload the app. Offers are now private end-to-end, the
-- service/offer materials + pricing fields save correctly, and no user can
-- read another user's phone/address/GPS via the API.
--
-- IMPORTANT: this matched-set of app changes (cross-user reads now hit
-- profiles_public) ships with this commit — run this SQL and update the app
-- together, or cross-user names/avatars will read empty until both are live.
-- ────────────────────────────────────────────────────────────────────────────
