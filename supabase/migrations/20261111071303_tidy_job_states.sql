-- Retire the unused job states in_progress and awaiting_completion. Jobs are
-- one-step (open → accepted → completed / cancelled); nothing writes the two
-- removed states, and migration 20261014120000 already normalised any
-- awaiting_completion rows to completed (plus a BEFORE trigger keeps doing so
-- for old app builds). Bookings keep both states — this only touches jobs.

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status = any (array['open'::text, 'accepted'::text, 'completed'::text, 'cancelled'::text]));
