begin;
-- "Not reviewing this one": a participant can dismiss Home's "Leave a review"
-- prompt for a completed job or booking (e.g. a provider who doesn't want to
-- review a requester or a listing enquirer). Private to that person; it hides
-- the prompt only and never blocks a later review from the job or booking page.
create table public.review_prompt_dismissals (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 job_id uuid references public.jobs(id) on delete cascade,
 booking_id uuid references public.bookings(id) on delete cascade,
 reviewer_role text not null check (reviewer_role in ('requester','provider')),
 created_at timestamptz not null default now(),
 constraint review_prompt_dismissals_one_subject check ((job_id is null) <> (booking_id is null))
);
create unique index review_prompt_dismissals_job_unique on public.review_prompt_dismissals (user_id, job_id, reviewer_role) where job_id is not null;
create unique index review_prompt_dismissals_booking_unique on public.review_prompt_dismissals (user_id, booking_id, reviewer_role) where booking_id is not null;

alter table public.review_prompt_dismissals enable row level security;
revoke all on public.review_prompt_dismissals from public,anon,authenticated;
grant select,insert,delete on public.review_prompt_dismissals to authenticated;
create policy review_prompt_dismissals_read on public.review_prompt_dismissals for select to authenticated
 using(user_id=(select auth.uid()));
-- Only for work you took part in, in the role you held.
create policy review_prompt_dismissals_add on public.review_prompt_dismissals for insert to authenticated
 with check(user_id=(select auth.uid()) and (
  (job_id is not null and (
    (reviewer_role='requester' and exists(select 1 from public.jobs j where j.id=job_id and j.requester_id=(select auth.uid())))
    or (reviewer_role='provider' and exists(select 1 from public.bids b where b.job_id=review_prompt_dismissals.job_id and b.provider_id=(select auth.uid()) and b.status='accepted'))))
  or (booking_id is not null and exists(select 1 from public.bookings k where k.id=booking_id
    and ((reviewer_role='requester' and k.requester_id=(select auth.uid())) or (reviewer_role='provider' and k.provider_id=(select auth.uid())))))
 ));
create policy review_prompt_dismissals_remove on public.review_prompt_dismissals for delete to authenticated
 using(user_id=(select auth.uid()));
create policy "Assistants cannot read" on public.review_prompt_dismissals as restrictive for select to public using(not public.is_assistant_token());
create policy "Assistants cannot insert" on public.review_prompt_dismissals as restrictive for insert to public with check(not public.is_assistant_token());
create policy "Assistants cannot delete" on public.review_prompt_dismissals as restrictive for delete to public using(not public.is_assistant_token());
commit;
