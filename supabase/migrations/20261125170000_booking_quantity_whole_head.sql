-- Grazing head counts must be whole numbers. This replaces the capacity
-- trigger from 20261125143000; do not edit that applied migration.
-- Existing rows are left as they are. The check runs only on insert and
-- when quantity changes, which is the same timing as the capacity rule.
-- A fractional head booking may already exist because quantity is numeric
-- and the previous booking form accepted decimals. This does not rewrite
-- those rows. Not applied: approve and run `supabase db push` separately.

create or replace function public.enforce_booking_quantity_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing record;
  unit text;
  minimum numeric;
  capacity numeric;
  snapshot_minimum text;
begin
  if tg_op = 'UPDATE' and new.quantity is not distinct from old.quantity then
    return new;
  end if;

  select kind, unit_label, minimum_units, max_units
    into listing
  from public.services
  where id = new.service_id;
  if not found then
    return new;
  end if;

  unit := coalesce(listing.unit_label, '');
  minimum := greatest(1, coalesce(listing.minimum_units, 1));
  if new.pricing_snapshot is not null and jsonb_typeof(new.pricing_snapshot) = 'object' then
    if new.pricing_snapshot ? 'unit_label' then
      unit := coalesce(new.pricing_snapshot->>'unit_label', '');
    end if;
    snapshot_minimum := new.pricing_snapshot->>'minimum_units';
    if snapshot_minimum ~ '^[0-9]+(\.[0-9]+)?$' then
      minimum := greatest(1, snapshot_minimum::numeric);
    end if;
  end if;

  if listing.kind is distinct from 'grazing' or unit !~ '^head/(week|month)$' then
    return new;
  end if;
  -- Reject 1.5. Accept 2 and 2.0. Do this even when the listing has no cap,
  -- and before the capacity early-return below.
  if new.quantity <> trunc(new.quantity) then
    raise exception 'Enter a whole number of head'
      using errcode = '23514';
  end if;
  capacity := listing.max_units;
  if capacity is null or capacity < minimum then
    return new;
  end if;
  if new.quantity > capacity then
    raise exception 'Booking quantity exceeds this listing''s capacity of % head', capacity
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_booking_quantity_capacity() from public, anon, authenticated;

drop trigger if exists bookings_enforce_quantity_capacity on public.bookings;
create trigger bookings_enforce_quantity_capacity
before insert or update on public.bookings
for each row execute function public.enforce_booking_quantity_capacity();
