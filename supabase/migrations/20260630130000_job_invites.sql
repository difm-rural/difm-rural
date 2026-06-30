-- Direct private job offers (Connections Phase 2).
-- A requester can offer a job straight to a provider they've worked with. By
-- default the job is invite-only (hidden from the public board); the requester
-- may also choose to post it publicly.
--
-- Idempotent: safe to run more than once.

-- 1. Job visibility. Existing jobs stay public.
alter table public.jobs
  add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'invite_only'));

-- 2. Invites — who a job has been privately offered to.
create table if not exists public.job_invites (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  requester_id uuid not null,
  provider_id  uuid not null,
  status       text not null default 'pending' check (status in ('pending', 'seen', 'declined')),
  created_at   timestamptz not null default timezone('utc', now()),
  unique (job_id, provider_id)
);
create index if not exists job_invites_provider_idx on public.job_invites(provider_id);

alter table public.job_invites enable row level security;

drop policy if exists "Invites visible to provider and requester" on public.job_invites;
create policy "Invites visible to provider and requester"
  on public.job_invites for select
  using (auth.uid() = provider_id or auth.uid() = requester_id);

drop policy if exists "Requester can invite to own jobs" on public.job_invites;
create policy "Requester can invite to own jobs"
  on public.job_invites for insert
  with check (
    auth.uid() = requester_id
    and exists (select 1 from public.jobs j where j.id = job_id and j.requester_id = auth.uid())
  );

drop policy if exists "Provider can update own invite" on public.job_invites;
create policy "Provider can update own invite"
  on public.job_invites for update
  using (auth.uid() = provider_id)
  with check (auth.uid() = provider_id);

grant select, insert, update on public.job_invites to authenticated;

-- 3. Audience-scoped job visibility. Replaces "Anyone can view open jobs".
--    Public jobs are visible to all; invite-only jobs only to the owner and
--    the providers invited to them.
drop policy if exists "Anyone can view open jobs" on public.jobs;
drop policy if exists "Jobs are viewable by audience" on public.jobs;
create policy "Jobs are viewable by audience"
  on public.jobs for select
  using (
    visibility = 'public'
    or requester_id = auth.uid()
    or exists (
      select 1 from public.job_invites ji
      where ji.job_id = jobs.id and ji.provider_id = auth.uid()
    )
  );

-- 4. Notify the provider when they're invited (notifications are trigger-made).
create or replace function public.notify_job_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_name  text;
begin
  select title into v_title from public.jobs where id = NEW.job_id;
  select coalesce(display_name, full_name, 'Someone') into v_name
    from public.profiles where id = NEW.requester_id;

  insert into public.notifications (user_id, type, title, body, metadata)
  values (
    NEW.provider_id,
    'new_job_invite',
    'New job offer',
    v_name || ' invited you to a job: ' || coalesce(v_title, 'a job'),
    jsonb_build_object('job_id', NEW.job_id, 'sender_id', NEW.requester_id)
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_job_invite on public.job_invites;
create trigger trg_notify_job_invite
  after insert on public.job_invites
  for each row execute function public.notify_job_invite();
