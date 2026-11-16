-- Job photos (bucket 'job-photos'): you may only add files to your own folder.
-- Previously any signed-in user could upload anywhere in the bucket.
--
-- New uploads are stored under the uploader's id as the first folder:
--   app job photos (wizard, edit, guest draft)  <user id>/<job id>/<file>  (+ _thumb)
--   web job form (before a new job's row exists) <user id>/<job id>/<file>  (+ _thumb)
--   chat photos, app and web                     <user id>/<chat id>/<file>
--
-- Transitional: app builds that haven't taken the matching update still upload
-- job photos as <job id>/<file> right after creating the job, so a path whose
-- first folder is a job the caller requested is also allowed. (Their chat
-- photos, <chat id>/<file>, are blocked until the app updates.)
--
-- Update / delete rules are unchanged (the uploader, via owner = auth.uid()).
-- Reads stay public: keeps one public-read policy and drops the duplicate.
--
-- Idempotent: drops the old and new policy names before creating.

drop policy if exists "Authenticated users can upload job photos" on storage.objects;
drop policy if exists "authenticated users can upload job photos" on storage.objects;
drop policy if exists "users can upload job photos to their own folder" on storage.objects;

create policy "users can upload job photos to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      -- Transitional: older app builds' <job id>/<file> for the caller's own job.
      or exists (
        select 1 from public.jobs j
        where j.id::text = (storage.foldername(name))[1]
          and j.requester_id = auth.uid()
      )
    )
  );

-- Two identical public-read policies existed; keep "job photos are public".
drop policy if exists "Anyone can view job photos" on storage.objects;
