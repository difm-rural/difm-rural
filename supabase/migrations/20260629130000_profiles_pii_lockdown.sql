-- Lock down profiles PII.
-- Before: the base `profiles` table was world-readable (RLS USING true), so a
-- crafted API query could read anyone's phone / address / GPS.
-- After:  the base table is readable only by its owner (so a user still reads
-- their own contact details), and a non-sensitive public view backs every
-- cross-user read (names, avatars, bios, region).
--
-- Idempotent: safe to run more than once.

-- 1. Public projection — explicitly excludes phone, address, latitude,
--    longitude and is_admin. Definer view so it can read all rows while the
--    base table stays owner-only.
drop view if exists public.profiles_public;
create view public.profiles_public
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
    created_at
  from public.profiles;

grant select on public.profiles_public to anon, authenticated;

-- 2. Base table: a user may SELECT only their own row.
alter table public.profiles enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.profiles', pol.policyname);
  end loop;
end $$;

create policy "Profiles are viewable by owner"
  on public.profiles
  for select
  using (auth.uid() = id);
