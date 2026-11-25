# Existing local-only PostgreSQL fixture. Real schema, policies and update guards;
# all fixture DDL, migration application and test data roll back together.
param([int]$Port=56432,[string]$Database='postgres',[string]$Psql='C:/Program Files/PostgreSQL/17/bin/psql.exe')
$ErrorActionPreference='Stop'
$repo=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$baseline=Get-Content (Join-Path $repo 'supabase/migrations/00000000000000_baseline.sql') -Raw
$table=[regex]::Match($baseline,'(?s)CREATE TABLE public.bookings \(.*?\r?\n\);').Value
$completion=Get-Content (Join-Path $repo 'supabase/migrations/20261014120000_provider_led_completion.sql') -Raw
$guard=[regex]::Match($completion,'(?s)CREATE OR REPLACE FUNCTION public.enforce_booking_update_rules\(\).*?\$\$;').Value
$policies=([regex]::Matches($baseline,'(?m)^CREATE POLICY .*? ON public.bookings .*?;\r?$') | ForEach-Object Value) -join "`n"
if(!$table -or !$guard -or !$policies){throw 'Could not read existing booking schema/policies/guard'}
$setup=@'
\set ON_ERROR_STOP on
begin;
do $$begin
 if to_regclass('public.bookings') is not null or to_regclass('public.services') is not null then
  raise exception 'Expected existing isolated fixture without booking/services tables';
 end if;
end$$;
create table public.services(id uuid primary key,kind text,pricing_type text,unit_label text,pricing_variants jsonb,max_units numeric,is_active boolean default true,provider_id uuid);
create view public.services_public as select * from public.services where is_active or provider_id=auth.uid();
'@
$checks=Get-Content (Join-Path $repo 'tests/sql/booking-duration.test.sql') -Raw
$snapshot=Get-Content (Join-Path $repo 'supabase/migrations/20261019150000_booking_pricing_snapshot.sql') -Raw
$duration=Get-Content (Join-Path $repo 'supabase/migrations/20261125140000_booking_expected_duration.sql') -Raw
$sql=$setup+"`n"+$table+"`n"+$guard+"`n"+$policies+"`n"+$snapshot+"`n"+$duration+"`n"+$checks+"`nrollback;"
$file=Join-Path ([IO.Path]::GetTempPath()) ('rc-booking-duration-'+[guid]::NewGuid()+'.sql')
try {
 Set-Content -LiteralPath $file -Value $sql
 & $Psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $file
 if($LASTEXITCODE -ne 0){throw 'Local booking duration/permission checks failed'}
} finally {Remove-Item -LiteralPath $file -Force}
