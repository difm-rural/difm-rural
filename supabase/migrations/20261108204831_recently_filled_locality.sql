-- Derive a coarse town/suburb for "recently filled" when a job has no
-- location_area, without ever exposing a street number or road name.
begin;

-- Locality = the comma-separated part before the country, with postcodes/digits
-- stripped. Returns null when nothing safe can be derived (empty, digits-only, or
-- a street — i.e. ends in a road-type word like Road/Street/Ave/…). Street numbers
-- and road names are never returned.
create or replace function public.locality_from_address(addr text) returns text
language plpgsql immutable set search_path = public as $$
declare
  parts text[];
  n int;
  town text;
begin
  if addr is null or btrim(addr) = '' then return null; end if;
  select array_agg(btrim(p)) into parts
    from regexp_split_to_table(addr, ',') as p
   where btrim(p) <> '';
  if parts is null then return null; end if;
  n := array_length(parts, 1);
  if n >= 1 and parts[n] ~* '^(new zealand|aotearoa|nz)$' then n := n - 1; end if;
  if n < 1 then return null; end if;
  -- candidate locality part, with digit groups (postcodes, numbers) removed
  town := btrim(regexp_replace(regexp_replace(parts[n], '\d+', ' ', 'g'), '\s+', ' ', 'g'));
  if town = '' or town !~ '[[:alpha:]]' then return null; end if;
  -- reject streets: a road-type word as the final whole word
  if town ~* '\y(road|rd|street|st|avenue|ave|lane|ln|drive|dr|highway|hwy|place|pl|crescent|cres|terrace|tce|close|court|ct|parade|grove|boulevard|blvd|quay|esplanade|motorway|way|row|mews)\y\s*$' then
    return null;
  end if;
  return town;
end;
$$;

-- recently_filled_jobs: fall back to the derived town when location_area is blank;
-- skip rows where neither yields a safe area. Every other rule is unchanged.
create or replace function public.recently_filled_jobs(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_km int default 50,
  p_limit int default 12
) returns table(category text, area text, filled_at timestamptz)
language sql security definer stable set search_path = public as $$
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

-- Backfill: give jobs with no location_area a derived town (town-level only;
-- never a street). House-sitting jobs that set location_area deliberately keep it.
update public.jobs j
   set location_area = public.locality_from_address(j.location_name)
 where (j.location_area is null or btrim(j.location_area) = '')
   and public.locality_from_address(j.location_name) is not null;

commit;
