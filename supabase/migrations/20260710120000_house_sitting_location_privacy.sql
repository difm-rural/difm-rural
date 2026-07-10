-- House-sitting support + two-tier job location privacy.
--
-- A requester can hide their EXACT location (address, precise pin, polygon,
-- access notes) on a job. The public board then shows only a coarse `area`
-- (town/region); the exact location is revealed to the accepted provider (and
-- always the owner). Enforced in the database, not just the UI.
--
-- Idempotent: safe to run more than once.

-- 1. New job fields.
alter table public.jobs add column if not exists hide_exact_location boolean not null default false;
alter table public.jobs add column if not exists location_area text;   -- coarse public area (e.g. "Near Fairlie, Canterbury")
alter table public.jobs add column if not exists date_from date;       -- away / duration start
alter table public.jobs add column if not exists date_to   date;       -- away / duration end

-- 2. Allow an "unpaid / in-kind" price type (e.g. house-sitting for free board).
alter table public.jobs drop constraint if exists jobs_price_type_check;
alter table public.jobs add constraint jobs_price_type_check
  check (price_type = any (array['fixed'::text, 'open'::text, 'unpaid'::text]));

-- 3. Who may see a job's EXACT location. If the job doesn't hide it, everyone;
--    otherwise only the owner and the accepted provider. SECURITY DEFINER so it
--    can check the accepted bid without tripping RLS.
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

-- 4. jobs_public: the read surface for browsing. security_invoker = true so the
--    existing audience RLS on jobs still applies (public / owner / invited), and
--    the exact-location columns are masked to viewers who can't see them. The
--    coarse `location_area` is always exposed.
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
