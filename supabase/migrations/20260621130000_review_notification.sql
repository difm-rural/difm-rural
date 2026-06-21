-- Notify the reviewee when they receive a review/rating.
--
-- Reviews are shared between jobs and service bookings (reviews.job_id OR
-- reviews.booking_id), so a single trigger covers both marketplaces. The star
-- rating is included in the body so the recipient sees it without opening the app.
-- Safe to paste into the Supabase SQL editor.

create or replace function public.notify_review_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_reviewer text;
begin
  -- Who left the review (from the reviewer's perspective).
  v_reviewer := case new.reviewer_role
    when 'requester' then 'The requester'
    when 'provider'  then 'The provider'
    else 'Someone'
  end;

  -- Title of the job, or of the booked service.
  if new.job_id is not null then
    select title into v_title from jobs where id = new.job_id;
  elsif new.booking_id is not null then
    select s.title into v_title
    from bookings b
    join services s on s.id = b.service_id
    where b.id = new.booking_id;
  end if;
  v_title := coalesce(v_title, 'your recent work');

  insert into notifications (user_id, type, body, metadata)
  values (
    new.reviewee_id,
    'review_received',
    format('%s left you a %s★ review for "%s".', v_reviewer, new.rating, v_title),
    jsonb_build_object('job_id', new.job_id, 'booking_id', new.booking_id, 'rating', new.rating)
  );

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists reviews_notify_created on public.reviews;
create trigger reviews_notify_created
  after insert on public.reviews
  for each row execute function public.notify_review_created();
