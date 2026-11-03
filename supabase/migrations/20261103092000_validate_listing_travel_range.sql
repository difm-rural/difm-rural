-- Validate new/changed travel ranges without rewriting historical listings.
create or replace function public.validate_listing_travel_range()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.travel_range_km is not distinct from old.travel_range_km then return new; end if;
  end if;
  if new.travel_range_km is not null and (
    new.travel_range_km < 0 or new.travel_range_km > 2000
    or new.travel_range_km <> trunc(new.travel_range_km)
  ) then
    raise exception using errcode='22003',message='Enter a whole number from 0 to 2,000 km, or leave travel range blank.';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_listing_travel_range on public.services;
create trigger validate_listing_travel_range before insert or update on public.services
for each row execute function public.validate_listing_travel_range();
