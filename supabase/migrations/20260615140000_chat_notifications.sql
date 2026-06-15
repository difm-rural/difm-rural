-- Notify the recipient when a chat message arrives (job chat + booking chat).
-- Idempotent; run in the SQL editor or via `supabase db push`.
--
-- Note: fires on every message, including when the recipient is actively in the
-- chat. Refining that (last-read / presence) is a future improvement.

-- Job chat
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_title text;
begin
  select full_name into v_name  from profiles where id = new.sender_id;
  select title     into v_title from jobs     where id = new.job_id;
  insert into notifications (user_id, type, body, metadata)
  values (
    new.receiver_id,
    'new_message',
    format('New message from %s about "%s"', coalesce(v_name, 'someone'), coalesce(v_title, 'a job')),
    jsonb_build_object('job_id', new.job_id, 'sender_id', new.sender_id)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists messages_notify_new on public.messages;
create trigger messages_notify_new
  after insert on public.messages
  for each row execute function public.notify_new_message();

-- Service booking chat
create or replace function public.notify_new_booking_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_title text;
begin
  select full_name into v_name from profiles where id = new.sender_id;
  select s.title into v_title
    from bookings b
    join services s on s.id = b.service_id
   where b.id = new.booking_id;
  insert into notifications (user_id, type, body, metadata)
  values (
    new.receiver_id,
    'new_message',
    format('New message from %s about "%s"', coalesce(v_name, 'someone'), coalesce(v_title, 'a booking')),
    jsonb_build_object('booking_id', new.booking_id, 'sender_id', new.sender_id)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists service_booking_messages_notify_new on public.service_booking_messages;
create trigger service_booking_messages_notify_new
  after insert on public.service_booking_messages
  for each row execute function public.notify_new_booking_message();
