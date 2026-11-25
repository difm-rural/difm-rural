-- Reject a new grazing booking whose quantity is above the listing's head
-- capacity. App and web already refuse this before insert. This is the
-- database backstop for a direct insert. Quantity cannot be edited later by
-- members, and an update that does not change quantity is left alone.
-- Not applied: approve and run `supabase db push` separately.

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

  -- Same rule as shared/bookingQuantity.ts: only grazing charged per head
  -- for a week or a month, and only when capacity covers the minimum.
  if listing.kind is distinct from 'grazing' or unit !~ '^head/(week|month)$' then
    return new;
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
