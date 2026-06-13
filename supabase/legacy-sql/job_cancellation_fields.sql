-- Ensure the jobs table can store a cancellation reason/note shown to the
-- awarded provider. Run in the Supabase SQL editor. Idempotent.

alter table public.jobs
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_note text;
