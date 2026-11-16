create role anon;
create role authenticated;
create role service_role;
grant anon, authenticated, service_role to postgres with inherit false, set true;
create schema auth;
create table auth.users (id uuid primary key, created_at timestamptz, email text);
create table public.profiles (id uuid primary key, is_admin boolean not null default false);
alter table public.profiles enable row level security;
grant insert on public.profiles to authenticated;
create policy test_own_profile on public.profiles for insert to authenticated
  with check (id = '00000000-0000-4000-8000-000000000091'::uuid);
create table public.jobs (
  id uuid primary key, status text, visibility text, created_at timestamptz,
  requester_id uuid, price_type text, schedule_type text, scheduled_date text,
  date_from date, date_to date, title text
);
create table public.bids (
  id uuid primary key default gen_random_uuid(), job_id uuid, status text,
  provider_id uuid, created_at timestamptz, payment_method text, message text
);
create table public.work_schedules (
  job_id uuid unique, requester_id uuid, provider_id uuid,
  arrival_start_at timestamptz, expected_complete_at timestamptz
);
create table public.job_status_history (
  id bigint generated always as identity primary key, job_id uuid,
  from_status text, to_status text, changed_at timestamptz
);
create table public.services (kind text, created_at timestamptz);
create table public.notifications (type text, metadata jsonb, created_at timestamptz, body text);
create function public.current_user_is_admin() returns boolean
language sql stable as $$select coalesce(current_setting('test.admin', true) = 'yes', false)$$;

\ir ../../supabase/migrations/20261116100000_marketplace_health.sql

create function pg_temp.assert_true(actual boolean, label text) returns void language plpgsql as $$
begin
  if actual is distinct from true then raise exception 'Failed: %', label; end if;
end;
$$;
