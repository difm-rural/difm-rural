-- Payment handoff for accepted JOBS (bookings unchanged).
--
-- Rural Connections never handles money. This records *whose turn it is* around
-- payment: the accepted provider says how they'd like to be paid, the requester
-- marks it sent. No bank details live in columns — they only ever travel in the
-- job's message thread.

-- 1. Columns on bids (only ever set on the accepted offer).
alter table public.bids
  add column if not exists payment_method text
    check (payment_method in ('bank_transfer','cash','invoice','agreed')),
  add column if not exists payment_details_sent_at timestamptz,
  add column if not exists payment_marked_sent_at timestamptz;

-- 2a. Provider picks / changes how they'd like to be paid.
--     Posts their message into the job thread and notifies the requester.
create or replace function public.set_job_payment_method(
  p_bid uuid,
  p_method text,
  p_message text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid public.bids%rowtype;
  v_job public.jobs%rowtype;
begin
  select * into v_bid from public.bids where id = p_bid for update;
  if not found then raise exception 'This offer is unavailable.'; end if;

  -- Only the accepted provider on this bid may set the method.
  if v_bid.provider_id is distinct from auth.uid() or v_bid.status <> 'accepted' then
    raise exception 'Only the accepted provider can set the payment method.';
  end if;
  if v_bid.payment_marked_sent_at is not null then
    raise exception 'Payment has already been marked sent.';
  end if;
  if p_method not in ('bank_transfer','cash','invoice','agreed') then
    raise exception 'Unknown payment method.';
  end if;

  select * into v_job from public.jobs where id = v_bid.job_id;
  if not found or v_job.status not in ('accepted','in_progress') then
    raise exception 'This job is not in a state to arrange payment.';
  end if;

  -- Re-callable: changing the method just updates the row and re-stamps the time.
  update public.bids
    set payment_method = p_method,
        payment_details_sent_at = now()
    where id = v_bid.id;

  -- Post the provider's message into the job's existing thread.
  if coalesce(btrim(p_message), '') <> '' then
    insert into public.messages (job_id, sender_id, receiver_id, content)
    values (v_job.id, v_bid.provider_id, v_job.requester_id, p_message);
  end if;

  -- Tell the requester the next move is theirs.
  insert into public.notifications (user_id, type, body, metadata)
  values (
    v_job.requester_id,
    'payment_details_sent',
    format('The provider shared how to pay for "%s".', coalesce(v_job.title, 'your job')),
    jsonb_build_object('job_id', v_job.id, 'bid_id', v_bid.id)
  );
end;
$$;

-- 2b. Requester marks the payment as sent (or undoes it before completion).
create or replace function public.mark_job_payment_sent(
  p_bid uuid,
  p_undo boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid public.bids%rowtype;
  v_job public.jobs%rowtype;
begin
  select * into v_bid from public.bids where id = p_bid for update;
  if not found then raise exception 'This offer is unavailable.'; end if;

  select * into v_job from public.jobs where id = v_bid.job_id;
  if not found or v_job.requester_id is distinct from auth.uid() then
    raise exception 'Only the requester can mark payment sent.';
  end if;
  if v_bid.payment_method is null then
    raise exception 'No payment method has been set yet.';
  end if;
  if v_job.status not in ('accepted','in_progress','awaiting_completion') then
    raise exception 'This job is no longer awaiting payment.';
  end if;

  if p_undo then
    update public.bids set payment_marked_sent_at = null where id = v_bid.id;
    return;
  end if;

  update public.bids set payment_marked_sent_at = now() where id = v_bid.id;

  -- Post a short confirmation from the requester, then notify the provider.
  insert into public.messages (job_id, sender_id, receiver_id, content)
  values (
    v_job.id,
    v_job.requester_id,
    v_bid.provider_id,
    case when v_bid.payment_method = 'cash' then 'Paid on the day' else 'Payment sent 👍' end
  );

  insert into public.notifications (user_id, type, body, metadata)
  values (
    v_bid.provider_id,
    'payment_marked_sent',
    format('The requester marked payment sent for "%s".', coalesce(v_job.title, 'your job')),
    jsonb_build_object('job_id', v_job.id, 'bid_id', v_bid.id)
  );
end;
$$;

revoke all on function public.set_job_payment_method(uuid, text, text) from public, anon;
revoke all on function public.mark_job_payment_sent(uuid, boolean) from public, anon;
grant execute on function public.set_job_payment_method(uuid, text, text) to authenticated;
grant execute on function public.mark_job_payment_sent(uuid, boolean) to authenticated;
