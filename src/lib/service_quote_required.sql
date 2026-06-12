alter table public.services
  drop constraint if exists services_pricing_type_check;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.services'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%pricing_type%'
  loop
    execute format('alter table public.services drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

alter table public.services
  add constraint services_pricing_type_check
  check (pricing_type in ('hourly', 'fixed', 'per_unit', 'day_rate', 'quote_required'));
