alter table public.bookings
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists location_note text;
