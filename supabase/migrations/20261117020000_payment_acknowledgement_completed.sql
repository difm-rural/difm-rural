-- Preserve the existing acknowledgement RPC and side effects after work completion.
-- The legacy mark_job_payment_sent wrapper delegates to this same function.
begin;

create or replace function public.mark_job_payment_sorted(
  p_bid uuid,
  p_undo boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_job_id uuid;
  v_bid public.bids%rowtype;
  v_job public.jobs%rowtype;
  v_other uuid;
  v_actor_name text;
begin
  select job_id into v_job_id from public.bids where id = p_bid;
  if not found then raise exception 'This offer is unavailable.'; end if;

  -- Match accept_job_offer's job → bid lock order. Wait for in-flight status
  -- changes before deciding whether the job is eligible.
  select * into v_job from public.jobs where id = v_job_id for share;
  if not found then raise exception 'This offer is unavailable.'; end if;

  -- Re-read the winning offer after acquiring its lock so duplicate requests
  -- observe a committed acknowledgement before deciding whether to write.
  select * into v_bid from public.bids where id = p_bid and job_id = v_job_id for update;
  if not found then raise exception 'This offer is unavailable.'; end if;
  if v_actor is null
     or v_bid.status is distinct from 'accepted'
     or (v_actor is distinct from v_bid.provider_id and v_actor is distinct from v_job.requester_id) then
    raise exception 'Only the requester or the accepted provider can update payment.';
  end if;
  if v_job.status is null or v_job.status not in ('accepted', 'completed') then
    raise exception 'Payment acknowledgement is only available for accepted or completed jobs.';
  end if;
  if v_bid.provider_id is null or v_bid.provider_id = v_job.requester_id
     or exists (
       select 1 from public.bids other
       where other.job_id = v_job.id and other.status = 'accepted' and other.id <> v_bid.id
     ) then
    raise exception 'This job does not have a valid winning offer.';
  end if;

  -- Nothing to change → no duplicate message or notification.
  if coalesce(p_undo, false) = (v_bid.payment_sorted_at is null) then
    return;
  end if;

  v_other := case when v_actor = v_bid.provider_id then v_job.requester_id else v_bid.provider_id end;
  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_actor_name
    from public.profiles where id = v_actor;

  if p_undo then
    update public.bids set payment_sorted_at = null, payment_sorted_by = null where id = v_bid.id;
  else
    update public.bids set payment_sorted_at = now(), payment_sorted_by = v_actor where id = v_bid.id;
  end if;

  insert into public.messages (job_id, sender_id, receiver_id, content)
  values (
    v_job.id, v_actor, v_other,
    case when p_undo then 'Payment marked as not sorted yet' else 'Payment all taken care of ✓' end
  );

  insert into public.notifications (user_id, type, body, metadata)
  values (
    v_other,
    case when p_undo then 'payment_unsorted' else 'payment_sorted' end,
    format(
      case when p_undo then '%s marked payment as not sorted yet for "%s".'
           else '%s marked payment as all taken care of for "%s".' end,
      coalesce(v_actor_name, 'Someone'), coalesce(v_job.title, 'the job')),
    jsonb_build_object('job_id', v_job.id, 'bid_id', v_bid.id)
  );
end;
$$;

revoke all on function public.mark_job_payment_sorted(uuid, boolean) from public, anon;
grant execute on function public.mark_job_payment_sorted(uuid, boolean) to authenticated;

commit;
