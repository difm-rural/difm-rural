-- Signed-in RPC matrix for flexible payment. Runs as each user (role
-- authenticated + JWT sub) against the TEST job, then raises to ROLL BACK
-- everything: no rows, messages or notifications persist.
do $$
declare
  v_bid uuid := '06b1f321-18cd-4d88-8878-15c65fe18870';
  v_job uuid := 'c0bd86da-67e0-4ce7-aff9-69365e9b3571';
  v_req uuid := 'e8cf61d5-73a3-4485-a428-9cf2662e9f59';
  v_prov uuid := 'fcf74052-48de-44f0-a899-100a021f8dc8';
  v_out uuid;
  r text := '';
  v_row public.bids%rowtype;
  v_n int;
  v_txt text;
  t0 timestamptz := clock_timestamp();
begin
  select id into v_out from public.profiles where id not in (v_req, v_prov) limit 1;

  -- helper inline: become a user
  -- 0. provider confirms the job with a note (amount in message)
  perform set_config('request.jwt.claims', json_build_object('sub', v_prov, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.confirm_job(v_bid, now() + interval '1 day', 'bank_transfer',
    E'Please pay by bank transfer.\nAccount name: T\nAccount number: 00-0000-0000000-00\nReference: x',
    'about 3 hours, bring the gate key');
  reset role;
  select content into v_txt from public.messages where job_id = v_job order by created_at desc limit 1;
  r := r || E'\n[confirm_job 5-arg message]\n' || v_txt;

  -- 0b. old 4-arg call still resolves
  set local role authenticated;
  perform public.confirm_job(p_bid => v_bid, p_arrival => now() + interval '2 days', p_method => 'cash', p_message => '');
  reset role;
  select content into v_txt from public.messages where job_id = v_job and created_at >= now() and content like '%cash on the day%' limit 1;
  r := r || E'\n[confirm_job 4-arg message]\n' || coalesce(v_txt, 'MISSING');

  -- 1. requester sorts
  perform set_config('request.jwt.claims', json_build_object('sub', v_req, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.mark_job_payment_sorted(v_bid);
  reset role;
  select * into v_row from public.bids where id = v_bid;
  select count(*) into v_n from public.notifications where user_id = v_prov and type = 'payment_sorted' and metadata->>'bid_id' = v_bid::text and created_at >= now();
  select string_agg(content, ' / ') into v_txt from public.messages where job_id = v_job and sender_id = v_req and created_at >= now();
  r := r || format(E'\n[requester sorts] sorted=%s by_requester=%s provider_notified=%s msg="%s" old_col_written=%s',
    v_row.payment_sorted_at is not null, v_row.payment_sorted_by = v_req, v_n, v_txt, v_row.payment_marked_sent_at is not null);

  -- 1b. repeat is a no-op (no duplicate notification)
  set local role authenticated;
  perform public.mark_job_payment_sorted(v_bid);
  reset role;
  select count(*) into v_n from public.notifications where user_id = v_prov and type = 'payment_sorted' and created_at >= now();
  r := r || format(E'\n[requester sorts again] provider payment_sorted notifications=%s (expect 1)', v_n);

  -- 2. provider undoes → requester notified
  perform set_config('request.jwt.claims', json_build_object('sub', v_prov, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.mark_job_payment_sorted(v_bid, true);
  reset role;
  select * into v_row from public.bids where id = v_bid;
  select count(*) into v_n from public.notifications where user_id = v_req and type = 'payment_unsorted' and created_at >= now();
  select body into v_txt from public.notifications where user_id = v_req and type = 'payment_unsorted' and created_at >= now() limit 1;
  r := r || format(E'\n[provider undoes] cleared=%s by_cleared=%s requester_notified=%s body="%s"',
    v_row.payment_sorted_at is null, v_row.payment_sorted_by is null, v_n, v_txt);

  -- 3. provider sorts → requester notified
  set local role authenticated;
  perform public.mark_job_payment_sorted(v_bid);
  reset role;
  select * into v_row from public.bids where id = v_bid;
  select count(*) into v_n from public.notifications where user_id = v_req and type = 'payment_sorted' and created_at >= now();
  select body into v_txt from public.notifications where user_id = v_req and type = 'payment_sorted' and created_at >= now() limit 1;
  r := r || format(E'\n[provider sorts] sorted=%s by_provider=%s requester_notified=%s body="%s"',
    v_row.payment_sorted_at is not null, v_row.payment_sorted_by = v_prov, v_n, v_txt);

  -- 4. old RPC (requester undo via mark_job_payment_sent) runs the new logic
  perform set_config('request.jwt.claims', json_build_object('sub', v_req, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.mark_job_payment_sent(v_bid, true);
  reset role;
  select * into v_row from public.bids where id = v_bid;
  select count(*) into v_n from public.notifications where user_id = v_prov and type = 'payment_unsorted' and created_at >= now();
  r := r || format(E'\n[old mark_job_payment_sent undo by requester] cleared=%s provider_notified=%s', v_row.payment_sorted_at is null, v_n);

  -- 5. outsider rejected (set and undo)
  perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.mark_job_payment_sorted(v_bid);
    r := r || E'\n[outsider sorts] NOT REJECTED';
  exception when others then
    r := r || E'\n[outsider sorts] rejected: ' || sqlerrm;
  end;
  begin
    perform public.mark_job_payment_sent(v_bid, true);
    r := r || E'\n[outsider via old RPC] NOT REJECTED';
  exception when others then
    r := r || E'\n[outsider via old RPC] rejected: ' || sqlerrm;
  end;
  reset role;
  select * into v_row from public.bids where id = v_bid;
  r := r || format(E'\n[after outsider] still_unsorted=%s', v_row.payment_sorted_at is null);

  -- 6. anon cannot execute
  r := r || format(E'\n[anon execute privilege] sorted=%s confirm=%s',
    has_function_privilege('anon', 'public.mark_job_payment_sorted(uuid, boolean)', 'execute'),
    has_function_privilege('anon', 'public.confirm_job(uuid, timestamptz, text, text, text)', 'execute'));

  -- 7. payment line formats
  r := r || E'\n[lines] ' || public.job_payment_line(150, 'fixed', 'bank_transfer') || ' | ' || public.job_payment_line(45, 'hourly', 'cash')
    || ' | ' || public.job_payment_line(12.5, 'per_unit', 'invoice') || ' | ' || public.job_payment_line(1500, 'quote', 'agreed');

  raise exception E'MATRIX (rolled back):%', r;
end $$;
