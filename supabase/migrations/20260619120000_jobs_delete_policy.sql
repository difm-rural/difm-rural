-- The jobs table had SELECT/INSERT/UPDATE policies but no DELETE policy, so
-- RLS denied every delete — owners couldn't delete their own jobs from the app.
-- Child rows (bids, messages, questions, reviews, watchlist, check-ins) all
-- cascade on delete.

drop policy if exists "Requesters can delete their jobs" on public.jobs;
create policy "Requesters can delete their jobs"
  on public.jobs
  for delete
  using (auth.uid() = requester_id);
