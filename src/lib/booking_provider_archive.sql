alter table public.bookings
add column if not exists provider_archive_at timestamptz;
