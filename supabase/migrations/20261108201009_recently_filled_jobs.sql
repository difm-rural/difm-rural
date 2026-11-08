-- Privacy-safe "recently filled" activity signals. Adds jobs.accepted_at (set by a
-- trigger on any acceptance path — web RPC, mobile direct update, or SQL), and two
-- SECURITY DEFINER functions that expose only coarse aggregates (category, coarse
-- area, filled time, and a monthly count) — never coordinates, titles, prices, ids
-- or names.
begin;

-- ─── accepted_at + trigger (covers every acceptance path) ──────────────────────
alter table public.jobs add column if not exists accepted_at timestamptz;

create or replace function public.set_job_accepted_at() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'accepted' and new.accepted_at is null then
    new.accepted_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists jobs_set_accepted_at on public.jobs;
create trigger jobs_set_accepted_at before insert or update of status on public.jobs
for each row execute function public.set_job_accepted_at();

-- Backfill awarded/finished jobs from the accepted bid's created_at (an approximation).
update public.jobs j
   set accepted_at = (select b.created_at from public.bids b
                       where b.job_id = j.id and b.status = 'accepted'
                       order by b.created_at limit 1)
 where j.accepted_at is null
   and j.status in ('accepted','in_progress','cancellation_requested','completed')
   and exists (select 1 from public.bids b where b.job_id = j.id and b.status = 'accepted');

-- ─── recently_filled_jobs: coarse recent activity, optionally near an origin ────
create or replace function public.recently_filled_jobs(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_km int default 50,
  p_limit int default 12
) returns table(category text, area text, filled_at timestamptz)
language sql security definer stable set search_path = public as $$
  select j.category, j.location_area, j.accepted_at
    from public.jobs j
   where j.visibility = 'public'
     and j.status in ('accepted','in_progress','cancellation_requested','completed')
     and j.accepted_at is not null
     and j.accepted_at >= now() - interval '14 days'
     and coalesce(nullif(btrim(j.location_area), ''), null) is not null
     and lower(coalesce(j.category,'')) not in ('property & house sitting','animals & farm sitting')
     and (
       p_lat is null or p_lng is null
       or (
         j.latitude is not null and j.longitude is not null
         and 6371 * 2 * asin(sqrt(
               power(sin(radians(j.latitude - p_lat) / 2), 2)
             + cos(radians(p_lat)) * cos(radians(j.latitude))
               * power(sin(radians(j.longitude - p_lng) / 2), 2)
           )) <= p_radius_km
       )
     )
   order by j.accepted_at desc
   limit least(coalesce(p_limit, 12), 24);
$$;

-- ─── filled_jobs_count: this calendar month (Pacific/Auckland), aggregate only ──
create or replace function public.filled_jobs_count(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_km int default 50
) returns int
language sql security definer stable set search_path = public as $$
  select count(*)::int
    from public.jobs j
   where j.visibility = 'public'
     and j.status <> 'cancelled'
     and j.accepted_at is not null
     and date_trunc('month', j.accepted_at at time zone 'Pacific/Auckland')
         = date_trunc('month', now() at time zone 'Pacific/Auckland')
     and (
       p_lat is null or p_lng is null
       or (
         j.latitude is not null and j.longitude is not null
         and 6371 * 2 * asin(sqrt(
               power(sin(radians(j.latitude - p_lat) / 2), 2)
             + cos(radians(p_lat)) * cos(radians(j.latitude))
               * power(sin(radians(j.longitude - p_lng) / 2), 2)
           )) <= p_radius_km
       )
     );
$$;

revoke all on function public.recently_filled_jobs(double precision, double precision, int, int) from public;
revoke all on function public.filled_jobs_count(double precision, double precision, int) from public;
grant execute on function public.recently_filled_jobs(double precision, double precision, int, int) to anon, authenticated;
grant execute on function public.filled_jobs_count(double precision, double precision, int) to anon, authenticated;

commit;
