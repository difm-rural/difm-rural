-- Serialize offer changes with acceptance by locking job, then offer.
-- Withdrawal is deliberately scoped here rather than adding a broad DELETE policy.
create or replace function public.change_pending_job_offer(p_offer_id uuid,p_intent text,p_amount numeric default null,p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare offer public.bids%rowtype; job public.jobs%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 select * into offer from public.bids where id=p_offer_id;
 if not found or offer.provider_id is distinct from auth.uid() then raise exception 'This offer is unavailable.'; end if;
 select * into job from public.jobs where id=offer.job_id for update;
 if not found or job.status <> 'open' then raise exception 'This job is no longer open.'; end if;
 select * into offer from public.bids where id=p_offer_id for update;
 if not found or offer.status <> 'pending' or offer.provider_id is distinct from auth.uid() then raise exception 'This offer has changed.'; end if;
 if p_intent='withdraw' then
  delete from public.bids where id=offer.id;
 elsif p_intent='edit' then
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 or p_amount::text='NaN' or nullif(trim(p_message),'') is null or length(p_message)>5000 then raise exception 'Add a valid amount and message.'; end if;
  update public.bids set amount=p_amount,message=trim(p_message) where id=offer.id;
 else raise exception 'Invalid offer action.';
 end if;
end;
$$;
revoke all on function public.change_pending_job_offer(uuid,text,numeric,text) from public,anon;
grant execute on function public.change_pending_job_offer(uuid,text,numeric,text) to authenticated;

create or replace function public.delete_managed_job(p_job_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare job public.jobs%rowtype;
begin
 select * into job from public.jobs where id=p_job_id for update;
 if auth.uid() is null or not found or job.requester_id is distinct from auth.uid() then raise exception 'This job is unavailable.'; end if;
 if job.status <> 'cancelled' and (job.status <> 'open' or exists(select 1 from public.bids where job_id=job.id)) then raise exception 'Cancel this job before deleting it.'; end if;
 delete from public.jobs where id=job.id;
end;
$$;
revoke all on function public.delete_managed_job(uuid) from public,anon;
grant execute on function public.delete_managed_job(uuid) to authenticated;
