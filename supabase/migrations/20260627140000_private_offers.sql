-- Make job offers (bids) private. An offer is visible ONLY to:
--   • the provider who made it, and
--   • the requester who owns the job.
-- This replaces the old "Anyone can view bids" policy (USING true), which let
-- any user read every offer — counts, amounts, competing providers. Privacy is
-- now enforced at the database, not just hidden in the UI.
--
-- INSERT/UPDATE policies are unchanged: providers insert/update their own bids,
-- and the job owner can update bids on their jobs (accept / reject) — so the
-- accept-offer flow keeps working. Notification triggers run SECURITY DEFINER
-- and are unaffected.

drop policy if exists "Anyone can view bids" on public.bids;

create policy "Offers visible to provider and job owner"
  on public.bids
  for select
  using (
    auth.uid() = provider_id
    or auth.uid() = (select requester_id from public.jobs where jobs.id = bids.job_id)
  );
