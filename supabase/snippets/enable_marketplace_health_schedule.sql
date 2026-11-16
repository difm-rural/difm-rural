-- Explicit activation only. Run as postgres in the Cron metadata database.
begin;
do $$
begin
  if current_user <> 'postgres'
     or current_setting('cron.use_background_workers', true) is distinct from 'off'
     or coalesce(current_setting('cron.timezone', true), '') not in ('GMT', 'UTC', 'Etc/UTC')
     or current_setting('cron.database_name', true) is distinct from current_database() then
    raise exception 'Marketplace Health requires postgres, Cron local connection mode and a UTC Cron clock';
  end if;
end;
$$;

-- Local connection mode sends this command to PostgreSQL via libpq.
-- Commit the claim first so that a disconnected worker costs one attempt.
-- Hour 20 UTC allows cleanup after the NZST report window closes.
select cron.schedule(
  'marketplace-health', '*/5 18,19,20 * * *',
  $job$
  begin;
  set local role marketplace_health_cron;
  set local statement_timeout = '20s';
  set local lock_timeout = '2s';
  select marketplace_health_private.claim_scheduled();
  commit;

  begin;
  set local role marketplace_health_cron;
  set local statement_timeout = '20s';
  set local lock_timeout = '2s';
  select marketplace_health_private.finish_scheduled();
  commit;
  $job$
);
commit;
