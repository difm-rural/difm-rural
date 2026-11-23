# Reuse the existing isolated Property Network fixture. All DDL/data roll back.
# Never run against development Supabase: the host is deliberately local-only.
param([int]$Port=56432,[string]$Database='postgres',[string]$Psql='C:/Program Files/PostgreSQL/17/bin/psql.exe')
$ErrorActionPreference='Stop'
$repo=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$read={param($relative) Get-Content (Join-Path $repo $relative) -Raw}
$stripTransaction={param($sql) $sql -replace '(?im)^begin;\s*$|^commit;\s*$',''}
$privacyHarness=& $read 'tests/support/listing-location-privacy.ps1'
$setup=[regex]::Match($privacyHarness,'(?s)\$setup=@''\r?\n(.*?)\r?\n''@').Groups[1].Value
if(!$setup){throw 'Could not extract the existing privacy fixture setup'}
$network=& $read 'tests/sql/property-network-integration-local.sql'
$offset=$network.IndexOf('insert into profiles values')
if($offset -lt 0){throw 'Could not find existing network permission assertions'}
$locality=& $read 'supabase/migrations/20261108204831_recently_filled_locality.sql'
$localityFunction=[regex]::Match($locality,'(?s)create or replace function public\.locality_from_address.*?\$\$;').Value
$start=@'
\set ON_ERROR_STOP on
begin;
-- Known existing local fixture only; changes become visible to no other session.
do $$begin
 if to_regclass('public.property_network_areas') is null or to_regclass('public.property_network_services') is null or to_regprocedure('auth.uid()') is null then
  raise exception 'Expected existing Property Network base fixture';
 end if;
end$$;
truncate public.profiles cascade;
drop table if exists public.property_network_jobs;
drop function if exists public.replace_property_network_provider(text,text,uuid,uuid);
'@
$sql=$start+"`n"+(& $stripTransaction (& $read 'supabase/migrations/20261124090000_property_network_job_links.sql'))+"`n"+
 (& $stripTransaction $setup)+"`n"+$localityFunction+"`n"+
 (& $stripTransaction (& $read 'supabase/migrations/20261124120000_listing_location_privacy.sql'))+"`n"+
 $network.Substring($offset)+"`n"+(& $read 'tests/sql/listing-location-privacy.test.sql')+"`nrollback;"
$file=Join-Path ([IO.Path]::GetTempPath()) ('rc-combined-permissions-'+[guid]::NewGuid()+'.sql')
try {
 Set-Content -LiteralPath $file -Value $sql
 & $Psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $file
 if($LASTEXITCODE -ne 0){throw 'Combined local permission regression failed'}
} finally {Remove-Item -LiteralPath $file -Force}
