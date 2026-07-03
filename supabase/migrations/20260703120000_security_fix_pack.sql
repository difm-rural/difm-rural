-- Security fix pack (July 2026 review).
--
--  1. CRITICAL  block is_admin self-promotion via the own-profile UPDATE policy
--  2. HIGH      drop the legacy "Anyone can insert notifications" policy
--               (all notifications are created by SECURITY DEFINER triggers)
--  3. MEDIUM    job_invites: providers may only update `status` (not job_id)
--  4. MEDIUM    bids: only the job owner can change an offer's status, and a
--               bid can never be moved to a different job
--
-- Idempotent: safe to run more than once.

-- 1. is_admin can only be changed by an existing admin (or the SQL editor,
--    which runs as postgres and bypasses RLS/triggers' auth.uid() checks via
--    current_user_is_admin() = false but auth.uid() is null → still blocked;
--    enable admins with: update profiles set is_admin = true ... in the SQL
--    editor using the service role, or temporarily disable the trigger).
create or replace function public.protect_profile_privileged_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin then
    -- service_role / SQL-editor sessions have no auth.uid() and bypass RLS,
    -- but this trigger still fires — allow only when the caller is already an
    -- admin OR there is no API user at all (dashboard/service maintenance).
    if auth.uid() is not null and not public.current_user_is_admin() then
      raise exception 'is_admin can only be changed by an administrator';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileged on public.profiles;
create trigger trg_protect_profile_privileged
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_cols();

-- 2. Clients never insert notifications (triggers do, as SECURITY DEFINER).
drop policy if exists "Anyone can insert notifications" on public.notifications;

-- 3. Providers can only flip their invite's status (seen / declined) — never
--    re-point the invite at a different job.
revoke update on public.job_invites from authenticated;
grant update (status) on public.job_invites to authenticated;

-- 4. Offer status changes are the job owner's alone (accept / reject), and a
--    bid stays pinned to the job it was made on.
create or replace function public.protect_bid_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.job_id is distinct from old.job_id then
    raise exception 'An offer cannot be moved to a different job';
  end if;
  if new.status is distinct from old.status then
    if auth.uid() is not null and auth.uid() <> public.job_owner_id(new.job_id) then
      raise exception 'Only the job owner can change an offer''s status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_bid_integrity on public.bids;
create trigger trg_protect_bid_integrity
  before update on public.bids
  for each row execute function public.protect_bid_integrity();
