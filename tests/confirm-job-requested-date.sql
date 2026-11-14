-- confirm_job message wording vs the requested date. Runs confirm_job as the
-- accepted provider on the TEST job for each schedule shape, then raises to
-- ROLL BACK everything: no rows, messages or notifications persist.
--   npx supabase db query --linked -f tests/confirm-job-requested-date.sql
-- Expect the MATRIX text in the "error"; that is the report.
do $$
declare
  v_bid uuid := '06b1f321-18cd-4d88-8878-15c65fe18870';
  v_job uuid := 'c0bd86da-67e0-4ce7-aff9-69365e9b3571';
  v_prov uuid := 'fcf74052-48de-44f0-a899-100a021f8dc8';
  -- 9 am NZ, three days from now (NZ calendar).
  v_day date := ((now() at time zone 'Pacific/Auckland')::date + 3);
  v_arrival timestamptz := ((v_day + time '09:00') at time zone 'Pacific/Auckland');
  r text := '';
  v_txt text;
  n record;
  c record;
begin
  -- Helper wording, fixed dates.
  for c in
    select * from (values
      ('specific match',          'specific', '2026-11-15', null::date, null::date, date '2026-11-15'),
      ('specific mismatch',       'specific', '2026-11-15', null, null, date '2026-11-16'),
      ('range match (last day)',  'range', null, date '2026-11-15', date '2026-11-18', date '2026-11-18'),
      ('range mismatch',          'range', null, date '2026-11-15', date '2026-11-18', date '2026-11-21'),
      ('range across months',     'range', null, date '2026-11-28', date '2026-12-02', date '2026-12-05'),
      ('flexible',                'flexible', null, null, null, date '2026-11-15'),
      ('asap',                    'asap', null, null, null, date '2026-11-15'),
      ('legacy: date, no type',   null, '2026-11-15', null, null, date '2026-11-16'),
      ('specific, unparseable',   'specific', 'next week', null, null, date '2026-11-16')
    ) as t(name, stype, sdate, dfrom, dto, day)
  loop
    select * into n from public.job_requested_day_note(c.stype, c.sdate, c.dfrom, c.dto, c.day);
    r := r || format(E'\n[helper · %s] suffix="%s" line="%s"', c.name, n.suffix, n.line);
  end loop;

  -- Real confirm_job messages, as the accepted provider.
  for c in
    select * from (values
      ('match',    'specific', v_day::text, null::date, null::date),
      ('mismatch', 'specific', (v_day - 1)::text, null, null),
      ('range match', 'range', null, v_day - 1, v_day + 2),
      ('range mismatch', 'range', null, v_day + 1, v_day + 4),
      ('flexible', 'flexible', null, null, null)
    ) as t(name, stype, sdate, dfrom, dto)
  loop
    update public.jobs set schedule_type = c.stype, scheduled_date = c.sdate, date_from = c.dfrom, date_to = c.dto where id = v_job;
    perform set_config('request.jwt.claims', json_build_object('sub', v_prov, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.confirm_job(v_bid, v_arrival, 'cash', '', 'tag-' || c.name);
    reset role;
    select content into v_txt from public.messages
     where job_id = v_job and created_at >= now() and content like '%Note: tag-' || c.name limit 1;
    r := r || format(E'\n[confirm_job · %s]\n%s', c.name, coalesce(v_txt, 'MISSING'));
  end loop;

  raise exception E'MATRIX (rolled back):%', r;
end $$;
