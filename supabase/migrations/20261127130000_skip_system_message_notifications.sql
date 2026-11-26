-- confirm_job and mark_payment_sorted post an automatic line into the job
-- thread ("Confirmed: I'll be there around …", "Payment all taken care of ✓")
-- AND insert their own job_confirmed / payment_sorted notification. The
-- new-message trigger then added a second "New message from …" notice for the
-- same event (Grokbot E2E run 5). Skip the generic notice for those lines; the
-- specific notification already covers them. Same definition otherwise.
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
  if new.job_id is not null and (
       new.content like 'Confirmed: I''ll be there around %'
       or new.content in ('Payment all taken care of ✓', 'Payment marked as not sorted yet')) then
    return new;
  end if;
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
