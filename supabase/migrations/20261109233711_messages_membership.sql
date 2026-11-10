-- Lock down who can post a message, and pin the payment card's source message.
--
-- The messages INSERT policy previously only checked `auth.uid() = sender_id`,
-- so any signed-in user could post into any job/listing thread. Replace it with
-- a membership helper. Bookings already had a participant policy; route it
-- through the same helper for consistency.

create or replace function public.can_post_message(
  p_sender uuid,
  p_receiver uuid,
  p_job_id uuid,
  p_service_id uuid,
  p_booking_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_job public.jobs%rowtype;
  v_owner uuid;
begin
  if p_sender is null or p_receiver is null or p_sender = p_receiver then
    return false;
  end if;

  -- ── Job conversation ───────────────────────────────────────────────────────
  if p_job_id is not null then
    select * into v_job from public.jobs where id = p_job_id;
    if not found then return false; end if;

    if v_job.status in ('accepted', 'in_progress', 'completed') then
      -- Exactly the requester and the accepted provider.
      return (
        (p_sender = v_job.requester_id and exists (
           select 1 from public.bids b
           where b.job_id = p_job_id and b.provider_id = p_receiver and b.status = 'accepted'))
        or
        (p_receiver = v_job.requester_id and exists (
           select 1 from public.bids b
           where b.job_id = p_job_id and b.provider_id = p_sender and b.status = 'accepted'))
      );

    elsif v_job.status = 'open' then
      -- Requester ↔ a provider who has engaged (bid / invite / question /
      -- earlier message). An outsider with none of those is blocked both ways;
      -- the first message can only come from an engaged provider, so "earlier
      -- message" cannot be used to bootstrap.
      declare
        v_other uuid := case when p_sender = v_job.requester_id then p_receiver else p_sender end;
      begin
        if p_sender <> v_job.requester_id and p_receiver <> v_job.requester_id then
          return false;  -- one side must be the requester
        end if;
        return exists (select 1 from public.bids b where b.job_id = p_job_id and b.provider_id = v_other)
            or exists (select 1 from public.job_invites i where i.job_id = p_job_id and i.provider_id = v_other)
            or exists (select 1 from public.job_questions q where q.job_id = p_job_id and q.asker_id = v_other)
            or exists (select 1 from public.messages m where m.job_id = p_job_id and (m.sender_id = v_other or m.receiver_id = v_other));
      end;

    else
      return false;  -- cancelled / anything else: no new messages
    end if;
  end if;

  -- ── Listing enquiry ────────────────────────────────────────────────────────
  if p_service_id is not null then
    select provider_id into v_owner from public.services where id = p_service_id;
    if v_owner is null then return false; end if;
    if p_sender = v_owner then
      -- Owner may reply only to someone who has already enquired.
      return exists (select 1 from public.messages m
                     where m.service_id = p_service_id and (m.sender_id = p_receiver or m.receiver_id = p_receiver));
    else
      return p_receiver = v_owner;  -- enquirer → the owner
    end if;
  end if;

  -- ── Booking ────────────────────────────────────────────────────────────────
  if p_booking_id is not null then
    return exists (
      select 1 from public.bookings b
      where b.id = p_booking_id
        and p_sender in (b.requester_id, b.provider_id)
        and p_receiver in (b.requester_id, b.provider_id)
    );
  end if;

  return false;
end;
$$;

revoke all on function public.can_post_message(uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.can_post_message(uuid, uuid, uuid, uuid, uuid) to authenticated;

-- messages (job + listing enquiry)
drop policy if exists "Users can send messages as themselves" on public.messages;
drop policy if exists "Members can post job and listing messages" on public.messages;
create policy "Members can post job and listing messages"
  on public.messages for insert to authenticated
  with check (auth.uid() = sender_id and public.can_post_message(sender_id, receiver_id, job_id, service_id, null));

-- service_booking_messages (booking) — same helper, equivalent to the old policy
drop policy if exists "Booking participants can create service booking messages" on public.service_booking_messages;
create policy "Booking participants can create service booking messages"
  on public.service_booking_messages for insert to authenticated
  with check (auth.uid() = sender_id and public.can_post_message(sender_id, receiver_id, null, null, booking_id));

-- ── Pin the payment card's source message ───────────────────────────────────
alter table public.bids add column if not exists payment_message_id uuid references public.messages(id) on delete set null;

-- Re-create set_job_payment_method so it records the id of the message it posts;
-- the payment card renders bank details only from that message, never by
-- scanning the thread.
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
  v_msg_id uuid;
begin
  select * into v_bid from public.bids where id = p_bid for update;
  if not found then raise exception 'This offer is unavailable.'; end if;
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

  if coalesce(btrim(p_message), '') <> '' then
    insert into public.messages (job_id, sender_id, receiver_id, content)
    values (v_job.id, v_bid.provider_id, v_job.requester_id, p_message)
    returning id into v_msg_id;
  end if;

  update public.bids
    set payment_method = p_method,
        payment_details_sent_at = now(),
        payment_message_id = coalesce(v_msg_id, payment_message_id)
    where id = v_bid.id;

  insert into public.notifications (user_id, type, body, metadata)
  values (
    v_job.requester_id,
    'payment_details_sent',
    format('The provider shared how to pay for "%s".', coalesce(v_job.title, 'your job')),
    jsonb_build_object('job_id', v_job.id, 'bid_id', v_bid.id)
  );
end;
$$;

revoke all on function public.set_job_payment_method(uuid, text, text) from public, anon;
grant execute on function public.set_job_payment_method(uuid, text, text) to authenticated;
