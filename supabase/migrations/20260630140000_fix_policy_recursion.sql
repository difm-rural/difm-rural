-- Fix: "infinite recursion detected in policy for relation jobs" when accepting
-- an offer.
--
-- The jobs/bids/job_invites RLS policies cross-reference each other:
--   jobs(update, provider) -> bids ; bids(select) -> jobs ; jobs(select) -> job_invites
-- Once the jobs SELECT policy gained a subquery (Phase 2 audience policy), that
-- chain became a cycle Postgres rejects.
--
-- Move each cross-table check into a SECURITY DEFINER helper that bypasses RLS,
-- so evaluating one policy never re-enters another table's RLS. Each helper only
-- ever checks the calling user's own relationship, so the privacy rules are
-- unchanged. Idempotent.

-- ── Helpers (run as owner, so they don't trigger RLS on the table they read) ──
create or replace function public.job_owner_id(p_job_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select requester_id from public.jobs where id = p_job_id;
$$;

create or replace function public.is_accepted_provider(p_job_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bids
    where job_id = p_job_id and provider_id = auth.uid() and status = 'accepted'
  );
$$;

create or replace function public.is_invited_to_job(p_job_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.job_invites
    where job_id = p_job_id and provider_id = auth.uid()
  );
$$;

grant execute on function public.job_owner_id(uuid) to anon, authenticated;
grant execute on function public.is_accepted_provider(uuid) to anon, authenticated;
grant execute on function public.is_invited_to_job(uuid) to anon, authenticated;

-- ── Recreate the three cross-referencing policies to use the helpers ──

-- bids: visible to the provider who made it and the job's owner
drop policy if exists "Offers visible to provider and job owner" on public.bids;
create policy "Offers visible to provider and job owner"
  on public.bids for select
  using (
    auth.uid() = provider_id
    or auth.uid() = public.job_owner_id(job_id)
  );

-- jobs: accepted provider may move an awarded job to awaiting_completion
drop policy if exists "Accepted provider can mark awaiting completion" on public.jobs;
create policy "Accepted provider can mark awaiting completion"
  on public.jobs for update to authenticated
  using (status in ('accepted', 'in_progress') and public.is_accepted_provider(id))
  with check (status = 'awaiting_completion' and public.is_accepted_provider(id));

-- jobs: public to all; invite-only jobs to the owner and invited providers
drop policy if exists "Jobs are viewable by audience" on public.jobs;
create policy "Jobs are viewable by audience"
  on public.jobs for select
  using (
    visibility = 'public'
    or requester_id = auth.uid()
    or public.is_invited_to_job(id)
  );
