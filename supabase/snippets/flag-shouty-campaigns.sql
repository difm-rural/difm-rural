-- Active seasonal campaigns whose title OR body would trip the new admin
-- "Use sentence case" warning. Mirrors admin-web/src/lib/case-style.ts
-- (needsSentenceCase) — the app-side heuristic is the source of truth; this is
-- the SQL approximation for finding existing offenders. Run in the Supabase SQL
-- editor (service role bypasses RLS). Read-only — nothing is modified.
select c.id, c.title, c.body
from seasonal_campaigns c
where c.is_active = true
  and exists (
    select 1
    from (values (c.title), (c.body)) as f(t)
    where
      -- "mostly uppercase": >=3 letters and >60% of them uppercase
      ( length(regexp_replace(f.t, '[^A-Za-z]', '', 'g')) >= 3
        and length(regexp_replace(f.t, '[^A-Z]', '', 'g'))::numeric
            / nullif(length(regexp_replace(f.t, '[^A-Za-z]', '', 'g')), 0) > 0.6 )
      or
      -- "Title Case": 3+ letter-words, every letter-word starts with a capital
      ( (select count(*) from unnest(regexp_split_to_array(btrim(f.t), '\s+')) w(word)
           where word ~ '[A-Za-z]') >= 3
        and not exists (
          select 1 from unnest(regexp_split_to_array(btrim(f.t), '\s+')) w(word)
          where word ~ '[A-Za-z]'
            and substring(word from '[A-Za-z]') <> upper(substring(word from '[A-Za-z]'))
        )
      )
  )
order by c.id;
