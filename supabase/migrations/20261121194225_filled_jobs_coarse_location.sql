-- Filled-jobs activity: stop the "near you" filter revealing where a job is.
--
-- recently_filled_jobs and filled_jobs_count are open to guests. They compared
-- the caller's chosen point against each job's exact coordinates with any
-- whole-km radius (0 and 1 included), so repeated probes could locate a filled
-- job, hidden-location jobs included, to well under a kilometre.
--
-- Now:
--   * a job's position is snapped to a 0.1 degree grid point (cells about
--     11 km north-south by 9 km east-west in New Zealand) before any distance
--     test, so no sequence of probes can learn more than which cell a job is in;
--     the functions already return the job's town or area, which is coarser
--     still or about the same.
--   * the radius is at least 10 km (null still means the 50 km default).
-- Return columns, grants and the 50 km "near you" behaviour are unchanged; a job
-- near a cell edge can move in or out of a 50 km circle by up to ~7 km.

create or replace function public.filled_job_within(
  p_job_lat double precision, p_job_lng double precision,
  p_lat double precision, p_lng double precision, p_radius_km integer)
returns boolean language sql immutable set search_path = '' as $$
  select p_lat is null or p_lng is null or (
    p_job_lat is not null and p_job_lng is not null
    and 6371 * 2 * asin(least(1, sqrt(
          power(sin(radians(round(p_job_lat::numeric, 1)::double precision - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(round(p_job_lat::numeric, 1)::double precision))
          * power(sin(radians(round(p_job_lng::numeric, 1)::double precision - p_lng) / 2), 2)
      ))) <= greatest(coalesce(p_radius_km, 50), 10)
  );
$$;
-- Internal helper: only the two functions below (running as their owner) call it.
revoke all on function public.filled_job_within(double precision, double precision, double precision, double precision, integer) from public, anon, authenticated;

create or replace function public.recently_filled_jobs(
  p_lat double precision default null, p_lng double precision default null,
  p_radius_km integer default 50, p_limit integer default 12)
returns table(category text, area text, filled_at timestamp with time zone)
language sql stable security definer set search_path = public as $$
  select j.category,
         coalesce(nullif(btrim(j.location_area), ''), public.locality_from_address(j.location_name)),
         j.accepted_at
    from public.jobs j
   where j.visibility = 'public'
     and j.status in ('accepted','in_progress','cancellation_requested','completed')
     and j.accepted_at is not null
     and j.accepted_at >= now() - interval '14 days'
     and coalesce(nullif(btrim(j.location_area), ''), public.locality_from_address(j.location_name)) is not null
     and lower(coalesce(j.category,'')) not in ('property & house sitting','animals & farm sitting')
     and public.filled_job_within(j.latitude, j.longitude, p_lat, p_lng, p_radius_km)
   order by j.accepted_at desc
   limit least(coalesce(p_limit, 12), 24);
$$;

create or replace function public.filled_jobs_count(
  p_lat double precision default null, p_lng double precision default null,
  p_radius_km integer default 50)
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int
    from public.jobs j
   where j.visibility = 'public'
     and j.status <> 'cancelled'
     and j.accepted_at is not null
     and date_trunc('month', j.accepted_at at time zone 'Pacific/Auckland')
         = date_trunc('month', now() at time zone 'Pacific/Auckland')
     and public.filled_job_within(j.latitude, j.longitude, p_lat, p_lng, p_radius_km);
$$;
