-- Optional for old app requests; web requests retain the price reviewed at creation.
alter table public.bookings add column if not exists pricing_snapshot jsonb;
alter table public.bookings add constraint bookings_pricing_snapshot_object check (pricing_snapshot is null or jsonb_typeof(pricing_snapshot)='object');
create or replace function public.keep_booking_pricing_snapshot() returns trigger language plpgsql set search_path=public as $$
begin
 if auth.uid() is not null and new.pricing_snapshot is distinct from old.pricing_snapshot then raise exception 'Booking request pricing cannot be changed after creation'; end if;
 return new;
end;
$$;
create trigger bookings_keep_pricing_snapshot before update on public.bookings for each row execute function public.keep_booking_pricing_snapshot();
