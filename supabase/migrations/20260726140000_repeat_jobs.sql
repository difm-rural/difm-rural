-- Repeat-job lineage now; recurrence-ready fields for a later scheduler.
-- Repeating a job creates a normal new listing and never changes the source.

alter table public.jobs
  add column if not exists repeated_from_job_id uuid references public.jobs(id) on delete set null,
  add column if not exists recurrence_frequency text not null default 'one_time',
  add column if not exists recurrence_rule jsonb;

alter table public.jobs
  drop constraint if exists jobs_recurrence_frequency_check;
alter table public.jobs
  add constraint jobs_recurrence_frequency_check
  check (recurrence_frequency in (
    'one_time', 'weekly', 'fortnightly', 'monthly', 'seasonal', 'custom'
  ));

create index if not exists jobs_repeated_from_idx
  on public.jobs (repeated_from_job_id)
  where repeated_from_job_id is not null;
