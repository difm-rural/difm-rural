-- Provider-initiated job completion handshake.
--
-- Adds an `awaiting_completion` step to the jobs lifecycle so the accepted
-- provider can flag the work as done; the requester then confirms (-> completed),
-- mirroring the bookings flow. Safe to paste into the Supabase SQL editor.

-- 1. Allow the new status value.
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status = any (array[
    'open'::text,
    'accepted'::text,
    'in_progress'::text,
    'awaiting_completion'::text,
    'completed'::text,
    'cancelled'::text
  ]));

-- 2. Let the accepted provider move an awarded job to `awaiting_completion`
--    (and nothing else — requester confirmation to `completed` stays owner-only).
drop policy if exists "Accepted provider can mark awaiting completion" on public.jobs;
create policy "Accepted provider can mark awaiting completion"
  on public.jobs for update to authenticated
  using (
    status in ('accepted', 'in_progress')
    and exists (
      select 1 from public.bids
      where bids.job_id = jobs.id
        and bids.provider_id = auth.uid()
        and bids.status = 'accepted'
    )
  )
  with check (
    status = 'awaiting_completion'
    and exists (
      select 1 from public.bids
      where bids.job_id = jobs.id
        and bids.provider_id = auth.uid()
        and bids.status = 'accepted'
    )
  );

-- 3. Notify the requester when the provider flags the job as done.
--    (Keeps the existing provider notifications for cancelled / completed.)
create or replace function public.notify_job_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider uuid;
begin
  if new.status = old.status then
    return new;
  end if;

  -- Provider flags the job done -> ask the requester to confirm.
  if new.status = 'awaiting_completion' then
    insert into notifications (user_id, type, body, metadata)
    values (
      new.requester_id,
      'job_ready',
      format('The provider says "%s" is complete. Please confirm.', coalesce(new.title, 'A job')),
      jsonb_build_object('job_id', new.id)
    );
    return new;
  end if;

  select provider_id into v_provider
  from bids
  where job_id = new.id and status = 'accepted'
  limit 1;

  if v_provider is null then
    return new;
  end if;

  if new.status = 'cancelled' and old.status in ('accepted', 'in_progress', 'awaiting_completion') then
    insert into notifications (user_id, type, body, metadata)
    values (
      v_provider,
      'job_cancelled',
      format('The job "%s" has been cancelled by the requester.', coalesce(new.title, 'a job')),
      jsonb_build_object('job_id', new.id)
    );
  elsif new.status = 'completed' then
    insert into notifications (user_id, type, body, metadata)
    values (
      v_provider,
      'job_completed',
      format('"%s" has been confirmed complete. You can now review the requester.', coalesce(new.title, 'A job')),
      jsonb_build_object('job_id', new.id)
    );
  end if;

  return new;
exception when others then
  return new;
end;
$$;
