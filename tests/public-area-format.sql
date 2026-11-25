-- Local regression for public town/area validation. Rolls back.
-- psql -v ON_ERROR_STOP=1 -f tests/public-area-format.sql
begin;

create table public.jobs (
  id integer primary key,
  title text,
  status text,
  location_area text
);
create table public.services (
  id integer primary key,
  title text,
  is_active boolean,
  location_name text
);

-- Stand-in for protect_listing_location: keep the last comma-separated part,
-- which is what the real privacy trigger stores as the public locality.
-- Its name sorts before validate_public_town_or_area, so it runs first.
create function public.protect_listing_location()
returns trigger language plpgsql as $$
declare parts text[];
begin
  if new.location_name is null or btrim(new.location_name) = '' then
    return new;
  end if;
  select array_agg(btrim(p)) into parts
    from regexp_split_to_table(new.location_name, ',') as p
   where btrim(p) <> '';
  if parts is not null then
    new.location_name := parts[array_length(parts, 1)];
  end if;
  return new;
end $$;
create trigger protect_listing_location
  before insert or update on public.services
  for each row execute function public.protect_listing_location();

\ir ../supabase/migrations/20261125120000_public_area_format.sql

insert into public.jobs(id, title, status, location_area) values
  (1, 'Fence', 'open', '  Te Kūiti  '),
  (2, 'Drain', 'open', null),
  (3, 'Sit', 'open', '   '),
  (4, 'Bay', 'open', 'Hawke’s Bay'),
  (5, 'Pass', 'open', 'Arthur''s Pass'),
  (6, 'Combined', 'open', U&'O\0304taki');
do $$ begin
  if (select location_area from public.jobs where id = 1) is distinct from 'Te Kūiti' then
    raise exception 'Job area was not trimmed';
  end if;
  if (select location_area from public.jobs where id = 3) is not null then
    raise exception 'Blank job area was stored';
  end if;
end $$;

do $$ begin
  begin
    insert into public.jobs(id, title, status, location_area)
    values (7, 'Bad', 'open', '<b>Waitoki</b> & "quotes" 😀');
    raise exception 'Markup job area accepted';
  exception when sqlstate '23514' then
    if sqlerrm not like '%town or area%' then raise exception 'Unexpected job area error: %', sqlerrm; end if;
  end;
  begin
    insert into public.jobs(id, title, status, location_area) values (8, 'Long', 'open', repeat('x', 151));
    raise exception 'Overlong job area accepted';
  exception when sqlstate '23514' then
    if sqlerrm not like '%150%' then raise exception 'Unexpected length error: %', sqlerrm; end if;
  end;
end $$;

-- A historical bad area can still receive an unrelated update.
alter table public.jobs disable trigger validate_public_town_or_area;
insert into public.jobs(id, title, status, location_area)
values (9, 'Legacy', 'open', '<b>Waitoki</b> & "quotes" 😀');
alter table public.jobs enable trigger validate_public_town_or_area;
update public.jobs set status = 'accepted' where id = 9;
do $$ begin
  begin
    update public.jobs set location_area = 'Waitoki 😀' where id = 9;
    raise exception 'Emoji job area accepted on update';
  exception when sqlstate '23514' then null;
  end;
end $$;
update public.jobs set location_area = 'Waitoki' where id = 9;

insert into public.services(id, title, is_active, location_name)
values (1, 'Grazing', true, '12 Kahikatea Road, Waitoki');
do $$ begin
  if (select location_name from public.services where id = 1) is distinct from 'Waitoki' then
    raise exception 'Listing privacy rewrite did not run before area validation';
  end if;
end $$;
insert into public.services(id, title, is_active, location_name)
values (2, 'No area', true, null);

do $$ begin
  begin
    insert into public.services(id, title, is_active, location_name)
    values (3, 'Marked', true, '<b>Waitoki</b> & "quotes" 😀');
    raise exception 'Markup listing area accepted';
  exception when sqlstate '23514' then
    if sqlerrm not like '%town or area%' then raise exception 'Unexpected listing area error: %', sqlerrm; end if;
  end;
  begin
    insert into public.services(id, title, is_active, location_name)
    values (4, 'Town markup', true, '12 Road, <b>Waitoki</b>');
    raise exception 'Markup locality accepted after privacy rewrite';
  exception when sqlstate '23514' then null;
  end;
end $$;

update public.services set is_active = false where id = 1;
update public.services set location_name = 'Nelson & Tasman' where id = 1;
do $$ begin
  if (select location_name from public.services where id = 1) is distinct from 'Nelson & Tasman' then
    raise exception 'Ampersand town was rewritten';
  end if;
end $$;

rollback;
