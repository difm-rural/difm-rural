-- The bookings table (created before the repo) is missing foreign keys on
-- requester_id/provider_id → profiles, so PostgREST can't resolve embeds like
-- `requester:requester_id(...)`. That made those queries 400 and return null,
-- which silently broke notification tap-through and full booking detail loads.
-- Adding the FKs repairs every such embed at once. Idempotent.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_requester_id_fkey' and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_requester_id_fkey
      foreign key (requester_id) references public.profiles(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_provider_id_fkey' and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_provider_id_fkey
      foreign key (provider_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

-- Nudge PostgREST to refresh its schema cache so the new relationships resolve.
notify pgrst, 'reload schema';
