-- ────────────────────────────────────────────────────────────────────────────
-- Apply the schema/policy changes from recent feature work.
-- Paste the whole file into the Supabase SQL editor and run once.
-- Every statement is idempotent (if-not-exists / drop-if-exists), so it's safe
-- to run again if you're unsure what's already applied.
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Daily summary opt-in (Account → Daily summary)
alter table public.user_preferences
  add column if not exists daily_digest boolean not null default false;

-- 2. Service materials policy (CreateService pricing step)
alter table public.services
  add column if not exists materials text;

-- 3. Provider offer (bid) pricing basis + materials
alter table public.bids
  add column if not exists pricing_type text;
alter table public.bids
  add column if not exists materials text;

-- 4. Private offers — an offer is visible only to its provider and the job owner.
--    Replaces the old "Anyone can view bids" policy (USING true).
drop policy if exists "Anyone can view bids" on public.bids;
drop policy if exists "Offers visible to provider and job owner" on public.bids;
create policy "Offers visible to provider and job owner"
  on public.bids
  for select
  using (
    auth.uid() = provider_id
    or auth.uid() = (select requester_id from public.jobs where jobs.id = bids.job_id)
  );

-- ────────────────────────────────────────────────────────────────────────────
-- After running: reload the app. Offers are now private end-to-end, and the
-- service/offer materials + pricing fields will save correctly.
-- ────────────────────────────────────────────────────────────────────────────
