-- Lightweight "how did that flow feel?" feedback, starting with the post-job
-- ease rating shown on the "Job posted" screen (mobile + web).
--
-- Privacy: users may only insert their own rows; there is no client-facing
-- select/update/delete. The admin console reads these rows through the standard
-- admin RLS gate (current_user_is_admin()), the same way other admin pages read
-- base tables — admin-web has no service-role client.
create table if not exists public.flow_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) default auth.uid(),
  flow text not null check (flow in ('post_job')),
  subject_id uuid,
  ease smallint not null check (ease between 1 and 5),
  comment text check (char_length(comment) <= 2000),
  platform text not null check (platform in ('ios','android','web')),
  app_version text,
  created_at timestamptz default now()
);

create index if not exists flow_feedback_created_at_idx
  on public.flow_feedback (created_at desc);

alter table public.flow_feedback enable row level security;

-- A user records only their own feedback.
drop policy if exists flow_feedback_insert_own on public.flow_feedback;
create policy flow_feedback_insert_own on public.flow_feedback
  for insert to authenticated
  with check (user_id = auth.uid());

-- Admins read everything for the console; no update/delete policy exists, so
-- rows are immutable from any client.
drop policy if exists flow_feedback_admin_read on public.flow_feedback;
create policy flow_feedback_admin_read on public.flow_feedback
  for select to authenticated
  using (public.current_user_is_admin());

grant insert, select on public.flow_feedback to authenticated;
