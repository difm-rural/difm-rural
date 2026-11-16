-- Run only after the report migration, function deployment and Vault setup.
-- The check starts at 07:00 Auckland; later ticks retry incomplete runs.
select cron.schedule(
  'marketplace-health',
  '*/5 18,19 * * *',
  $$select marketplace_health_private.dispatch();$$
);
