create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_role text not null check (reviewer_role in ('requester', 'provider')),
  reviewee_role text not null check (reviewee_role in ('requester', 'provider')),
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, reviewer_id, reviewer_role)
);

alter table public.reviews enable row level security;

create policy "Reviews are readable by job participants"
on public.reviews
for select
using (
  auth.uid() = reviewer_id
  or auth.uid() = reviewee_id
);

create policy "Users can create their own reviews"
on public.reviews
for insert
with check (auth.uid() = reviewer_id);

create policy "Users can update their own reviews"
on public.reviews
for update
using (auth.uid() = reviewer_id)
with check (auth.uid() = reviewer_id);
