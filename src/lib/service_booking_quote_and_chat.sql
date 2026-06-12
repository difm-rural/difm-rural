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
    add column if not exists quote_amount numeric,
    add column if not exists quote_notes text,
    add column if not exists quote_sent_at timestamptz,
    add column if not exists quote_accepted_at timestamptz,
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

create table if not exists public.service_booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists service_booking_messages_booking_created_idx
on public.service_booking_messages (booking_id, created_at);

alter table public.service_booking_messages enable row level security;

do $$
begin
  alter publication supabase_realtime add table public.service_booking_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

drop policy if exists "Booking participants can read service booking messages" on public.service_booking_messages;
create policy "Booking participants can read service booking messages"
on public.service_booking_messages
for select
to authenticated
using (
  exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and (auth.uid() = b.requester_id or auth.uid() = b.provider_id)
  )
);

drop policy if exists "Booking participants can create service booking messages" on public.service_booking_messages;
create policy "Booking participants can create service booking messages"
on public.service_booking_messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and (auth.uid() = b.requester_id or auth.uid() = b.provider_id)
      and (receiver_id = b.requester_id or receiver_id = b.provider_id)
  )
);
