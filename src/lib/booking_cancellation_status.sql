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
      'confirmed',
      'in_progress',
      'awaiting_completion',
      'cancellation_requested',
      'completed',
      'cancelled',
      'declined'
    ));
end $$;
