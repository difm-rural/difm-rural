-- Web acceptance is atomic: the job and all offers change together.
create or replace function public.accept_job_offer(p_offer_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare offer public.bids%rowtype; job public.jobs%rowtype;
begin
  select * into offer from public.bids where id = p_offer_id;
  if not found then raise exception 'This offer is unavailable.'; end if;
  select * into job from public.jobs where id = offer.job_id for update;
  if not found or job.requester_id is distinct from auth.uid() then raise exception 'Only the requester can accept an offer.'; end if;
  if job.status <> 'open' then raise exception 'This job is no longer open.'; end if;
  select * into offer from public.bids where id = p_offer_id for update;
  if not found or offer.status <> 'pending' then raise exception 'This offer is no longer pending.'; end if;
  update public.jobs set status = 'accepted' where id = job.id;
  update public.bids set status = 'accepted' where id = offer.id;
  update public.bids set status = 'rejected' where job_id = job.id and id <> offer.id and status = 'pending';
end;
$$;
revoke all on function public.accept_job_offer(uuid) from public, anon;
grant execute on function public.accept_job_offer(uuid) to authenticated;
