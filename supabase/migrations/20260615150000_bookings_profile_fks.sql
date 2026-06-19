-- The bookings table (created before the repo) was missing usable foreign keys
-- on requester_id/provider_id → profiles, so PostgREST couldn't resolve embeds
-- like `requester:requester_id(...)`. Those queries 400'd and returned null,
-- silently breaking notification tap-through and full booking detail loads.
--
-- Note: an `if not exists` guard proved unreliable here — a leftover same-named
-- constraint made it skip the real ADD. Drop-then-add is deterministic.
-- The COMMENT forces PostgREST to reload its schema cache.

alter table public.bookings drop constraint if exists bookings_requester_id_fkey;
alter table public.bookings drop constraint if exists bookings_provider_id_fkey;

alter table public.bookings
  add constraint bookings_requester_id_fkey
    foreign key (requester_id) references public.profiles(id) on delete cascade,
  add constraint bookings_provider_id_fkey
    foreign key (provider_id) references public.profiles(id) on delete cascade;

comment on table public.bookings is 'bookings';
