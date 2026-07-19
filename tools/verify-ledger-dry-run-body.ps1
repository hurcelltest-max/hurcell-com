$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$migration = Join-Path $root 'supabase/migrations/20260716120000_credit_ledger_finance_readiness.sql'
$dryRun = Join-Path $root 'supabase/tests/credit_ledger_finance_readiness_dry_run.sql'

$utf8 = New-Object System.Text.UTF8Encoding($false, $true)
$m = [System.IO.File]::ReadAllText($migration, $utf8)
$d = [System.IO.File]::ReadAllText($dryRun, $utf8)

$body = [regex]::Match($m, '(?s)^\s*BEGIN;\s*(.*?)\s*COMMIT;\s*$').Groups[1].Value
$embedded = [regex]::Match($d, '(?s)-- EXACT LEDGER MIGRATION BODY START\s*(.*?)\s*-- EXACT LEDGER MIGRATION BODY END').Groups[1].Value
if (-not $body -or -not $embedded) { throw 'Ledger migration or dry-run body markers are missing.' }
$normalize = { param($s) (($s -replace "`r`n", "`n").Trim() + "`n") }
$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = { param($s) ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes((& $normalize $s)))) -replace '-','').ToLowerInvariant() }
$a = & $hash $body; $b = & $hash $embedded
Write-Host "LEDGER_MIGRATION_BODY_SHA256=$a"
Write-Host "LEDGER_DRY_RUN_BODY_SHA256=$b"
if ($a -ne $b) { exit 1 }
exit 0
