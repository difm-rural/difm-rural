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

-- ────────────────────────────────────────────────────────────────────────────
-- After running: reload the app. Offers are now private end-to-end, the
-- service/offer materials + pricing fields save correctly, and no user can
-- read another user's phone/address/GPS via the API.
--
-- IMPORTANT: this matched-set of app changes (cross-user reads now hit
-- profiles_public) ships with this commit — run this SQL and update the app
-- together, or cross-user names/avatars will read empty until both are live.
-- ────────────────────────────────────────────────────────────────────────────
