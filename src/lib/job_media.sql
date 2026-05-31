-- Job media support for DIFM Rural.
-- Run this in the Supabase SQL editor if job photo uploads fail or the jobs
-- table does not yet have photo/schedule fields.

alter table public.jobs
  add column if not exists photos text[] default '{}'::text[],
  add column if not exists schedule_type text,
  add column if not exists scheduled_date text;

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "job photos are public" on storage.objects;
drop policy if exists "authenticated users can upload job photos" on storage.objects;
drop policy if exists "authenticated users can update job photos" on storage.objects;
drop policy if exists "authenticated users can delete job photos" on storage.objects;

create policy "job photos are public"
on storage.objects for select
using (bucket_id = 'job-photos');

create policy "authenticated users can upload job photos"
on storage.objects for insert
with check (bucket_id = 'job-photos' and auth.role() = 'authenticated');

create policy "authenticated users can update job photos"
on storage.objects for update
using (bucket_id = 'job-photos' and auth.role() = 'authenticated')
with check (bucket_id = 'job-photos' and auth.role() = 'authenticated');

create policy "authenticated users can delete job photos"
on storage.objects for delete
using (bucket_id = 'job-photos' and auth.role() = 'authenticated');
