-- Reword bid notifications to "offer" (user-facing). The notification type keys
-- (new_bid, bid_accepted, bid_rejected) and the bids table are unchanged.
-- Safe to paste into the Supabase SQL editor.

create or replace function public.notify_bid_placed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_owner uuid;
begin
  select title, requester_id into v_title, v_owner from jobs where id = new.job_id;
  if v_owner is not null and v_owner <> new.provider_id then
    insert into notifications (user_id, type, body, metadata)
    values (
      v_owner,
      'new_bid',
      format('New offer of $%s NZD on "%s"', new.amount::text, coalesce(v_title, 'your job')),
      jsonb_build_object('job_id', new.job_id)
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.notify_bid_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if new.status = old.status then
    return new;
  end if;

  select title into v_title from jobs where id = new.job_id;

  if new.status = 'accepted' then
    insert into notifications (user_id, type, body, metadata)
    values (
      new.provider_id,
      'bid_accepted',
      format('You got the job! Your offer of $%s NZD on "%s" was accepted.', new.amount::text, coalesce(v_title, 'a job')),
      jsonb_build_object('job_id', new.job_id)
    );
  elsif new.status = 'rejected' and old.status = 'pending' then
    insert into notifications (user_id, type, body, metadata)
    values (
      new.provider_id,
      'bid_rejected',
      format('Your offer on "%s" was not selected this time.', coalesce(v_title, 'a job')),
      jsonb_build_object('job_id', new.job_id)
    );
  end if;

  return new;
exception when others then
  return new;
end;
$$;
