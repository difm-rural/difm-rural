-- Listings L3: messaging substrate for enquiries.
-- Generalise `messages` so a chat can attach to a SERVICE LISTING (enquiry) with
-- no job behind it. A message is scoped to exactly one subject: a job OR a
-- service (XOR). RLS is participant-based (sender/receiver) and needs no change.
-- Idempotent.

alter table public.messages
  alter column job_id drop not null,
  add column if not exists service_id uuid references public.services(id) on delete cascade;

alter table public.messages drop constraint if exists messages_subject_exactly_one;
alter table public.messages
  add constraint messages_subject_exactly_one
  check (num_nonnulls(job_id, service_id) = 1);

create index if not exists messages_service_id_idx on public.messages (service_id);

-- Branch the new-message notification on service_id vs job_id. Job path is
-- unchanged; the error-swallow is preserved so chat never breaks on notify.
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name  text;
  v_title text;
begin
  select full_name into v_name from profiles where id = new.sender_id;
  if new.service_id is not null then
    select title into v_title from services where id = new.service_id;
    insert into notifications (user_id, type, body, metadata)
    values (
      new.receiver_id,
      'new_message',
      format('New message from %s about "%s"', coalesce(v_name, 'someone'), coalesce(v_title, 'a listing')),
      jsonb_build_object('service_id', new.service_id, 'sender_id', new.sender_id)
    );
  else
    select title into v_title from jobs where id = new.job_id;
    insert into notifications (user_id, type, body, metadata)
    values (
      new.receiver_id,
      'new_message',
      format('New message from %s about "%s"', coalesce(v_name, 'someone'), coalesce(v_title, 'a job')),
      jsonb_build_object('job_id', new.job_id, 'sender_id', new.sender_id)
    );
  end if;
  return new;
exception when others then
  return new;
end;
$function$;
