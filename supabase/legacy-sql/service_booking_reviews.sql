alter table public.reviews
  add column if not exists booking_id uuid references public.bookings(id) on delete cascade;

alter table public.reviews
  alter column job_id drop not null;

do $$
declare
  old_constraint text;
begin
  select conname into old_constraint
  from pg_constraint
  where conrelid = 'public.reviews'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) like '%job_id%'
    and pg_get_constraintdef(oid) like '%reviewer_id%'
    and pg_get_constraintdef(oid) like '%reviewer_role%'
  limit 1;

  if old_constraint is not null then
    execute format('alter table public.reviews drop constraint %I', old_constraint);
  end if;
end $$;

create unique index if not exists reviews_job_reviewer_role_unique
  on public.reviews(job_id, reviewer_id, reviewer_role)
  where job_id is not null;

create unique index if not exists reviews_booking_reviewer_role_unique
  on public.reviews(booking_id, reviewer_id, reviewer_role)
  where booking_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reviews'::regclass
      and conname = 'reviews_job_or_booking_check'
  ) then
    alter table public.reviews
      add constraint reviews_job_or_booking_check
      check (job_id is not null or booking_id is not null);
  end if;
end $$;
