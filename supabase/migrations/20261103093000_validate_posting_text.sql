-- Enforce the same limits as mobile and web. Existing text is not truncated;
-- unrelated status updates remain possible for historical overlong records.
create or replace function public.validate_posting_text()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if char_length(coalesce(new.title,'')) > 160 then
      raise exception using errcode='22001',message='Title must be 160 characters or fewer.';
    end if;
    if char_length(coalesce(new.description,'')) > 2000 then
      raise exception using errcode='22001',message='Description must be 2,000 characters or fewer.';
    end if;
  else
    if new.title is distinct from old.title and char_length(coalesce(new.title,'')) > 160 then
      raise exception using errcode='22001',message='Title must be 160 characters or fewer.';
    end if;
    if new.description is distinct from old.description and char_length(coalesce(new.description,'')) > 2000 then
      raise exception using errcode='22001',message='Description must be 2,000 characters or fewer.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists validate_posting_text on public.jobs;
create trigger validate_posting_text before insert or update on public.jobs
for each row execute function public.validate_posting_text();
drop trigger if exists validate_posting_text on public.services;
create trigger validate_posting_text before insert or update on public.services
for each row execute function public.validate_posting_text();
