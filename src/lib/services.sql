create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  category text not null,
  location_name text not null,
  travel_range_km numeric,
  pricing_type text not null check (pricing_type in ('hourly', 'fixed', 'per_unit', 'day_rate', 'quote_required')),
  rate numeric not null check (rate >= 0),
  unit_label text,
  minimum_units numeric not null default 1 check (minimum_units > 0),
  includes_equipment boolean not null default false,
  payment_timing text not null default 'on_completion' check (payment_timing in ('upfront', 'on_completion')),
  availability text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  quantity numeric not null default 1 check (quantity > 0),
  total_amount numeric not null check (total_amount >= 0),
  payment_timing text not null check (payment_timing in ('upfront', 'on_completion')),
  status text not null default 'pending' check (status in ('pending', 'quote_sent', 'confirmed', 'in_progress', 'awaiting_completion', 'cancellation_requested', 'completed', 'withdrawn', 'cancelled', 'declined')),
  scheduled_date text,
  location_name text not null,
  latitude numeric,
  longitude numeric,
  location_note text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.services enable row level security;
alter table public.bookings enable row level security;

do $$
declare
  status_constraint text;
begin
  select conname into status_constraint
  from pg_constraint
  where conrelid = 'public.bookings'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%'
  limit 1;

  if status_constraint is not null then
    execute format('alter table public.bookings drop constraint %I', status_constraint);
  end if;

  alter table public.bookings
    add constraint bookings_status_check
    check (status in (
      'pending',
      'quote_sent',
      'confirmed',
      'in_progress',
      'awaiting_completion',
      'cancellation_requested',
      'completed',
      'withdrawn',
      'cancelled',
      'declined'
    ));
end $$;

drop policy if exists "Active services are publicly readable" on public.services;
create policy "Active services are publicly readable"
on public.services
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Providers can read their own services" on public.services;
create policy "Providers can read their own services"
on public.services
for select
to authenticated
using (auth.uid() = provider_id);

drop policy if exists "Providers can create their own services" on public.services;
create policy "Providers can create their own services"
on public.services
for insert
to authenticated
with check (auth.uid() = provider_id);

drop policy if exists "Providers can update their own services" on public.services;
create policy "Providers can update their own services"
on public.services
for update
to authenticated
using (auth.uid() = provider_id)
with check (auth.uid() = provider_id);

drop policy if exists "Providers can delete their own services" on public.services;
create policy "Providers can delete their own services"
on public.services
for delete
to authenticated
using (auth.uid() = provider_id);

drop policy if exists "Booking participants can read bookings" on public.bookings;
create policy "Booking participants can read bookings"
on public.bookings
for select
to authenticated
using (auth.uid() = requester_id or auth.uid() = provider_id);

drop policy if exists "Requesters can create their own bookings" on public.bookings;
create policy "Requesters can create their own bookings"
on public.bookings
for insert
to authenticated
with check (auth.uid() = requester_id);

drop policy if exists "Booking participants can update bookings" on public.bookings;
create policy "Booking participants can update bookings"
on public.bookings
for update
to authenticated
using (auth.uid() = requester_id or auth.uid() = provider_id)
with check (auth.uid() = requester_id or auth.uid() = provider_id);
