# Reuse the existing isolated RC PostgreSQL fixture cluster (Property Network
# tables, profiles and auth.uid()/jwt() shims). No database is created. All
# temporary columns, policies, RPCs, map tables and fixture rows roll back.
param(
 [string]$Database='postgres',
 [int]$Port=56432,
 [string]$Psql='C:/Program Files/PostgreSQL/17/bin/psql.exe'
)
$ErrorActionPreference='Stop'
$repository=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$mapSql=Get-Content (Join-Path $repository 'supabase/migrations/20261118180000_private_property_map.sql') -Raw
$checks=Get-Content (Join-Path $repository 'tests/sql/private-property-map.test.sql') -Raw
$guards=Get-Content (Join-Path $repository 'supabase/migrations/20261118200000_assistant_tokens_read_only.sql') -Raw
$networkGuards=[regex]::Matches($guards,'create policy[^;]+on public\.property_network_(?:areas|services|providers)[^;]+;') | ForEach-Object Value
# is_assistant_token()/refuse_assistant_token() as deployed; created with
# "or replace" so a fixture that already has them is unaffected.
$assistantFunctions=[regex]::Matches($guards,'(?s)create or replace function public\.(?:is|refuse)_assistant_token\(\).*?\$\$;') | ForEach-Object Value
if($assistantFunctions.Count -ne 2){throw 'Assistant token functions not found'}
$readGuard=(Get-Content (Join-Path $repository 'supabase/migrations/20261125200000_private_property_map_assistant_read_guard.sql') -Raw) -replace '(?im)^begin;\s*$|^commit;\s*$',''
$setup=@'
\set ON_ERROR_STOP on
begin;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,created_at timestamptz);
alter table public.profiles add column display_name text, add column primary_role text;
'@
$file=Join-Path ([IO.Path]::GetTempPath()) ('rc-map-security-'+[guid]::NewGuid()+'.sql')
try {
 $sql=$setup+"`n"+($assistantFunctions -join "`n")+"`n"+($networkGuards -join "`n")+"`n"+($mapSql -replace '(?im)^begin;\s*$|^commit;\s*$','')+"`n"+$readGuard+"`n"+($checks -replace '(?im)^begin;\s*$','')
 Set-Content -LiteralPath $file -Value $sql
 & $Psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $file
 if($LASTEXITCODE -ne 0){throw 'Property map security regression failed'}
} finally {
 Remove-Item -LiteralPath $file -Force
}
