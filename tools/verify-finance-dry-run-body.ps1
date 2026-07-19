$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$migration = Join-Path $root 'supabase/migrations/20260716130000_finance_installments_mvp.sql'
$dryRun = Join-Path $root 'supabase/tests/finance_mvp_dry_run.sql'

$utf8 = New-Object System.Text.UTF8Encoding($false, $true)
$m = [System.IO.File]::ReadAllText($migration, $utf8)
$d = [System.IO.File]::ReadAllText($dryRun, $utf8)

$body = [regex]::Match($m, '(?s)^\s*BEGIN;\s*(.*?)\s*COMMIT;\s*$').Groups[1].Value
$embedded = [regex]::Match($d, '(?s)-- EXACT MIGRATION BODY START\s*(.*?)\s*-- EXACT MIGRATION BODY END').Groups[1].Value
if (-not $body -or -not $embedded) { throw 'Finance migration or dry-run body markers are missing.' }
$normalize = { param($s) (($s -replace "`r`n", "`n").Trim() + "`n") }
$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = { param($s) ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes((& $normalize $s)))) -replace '-','').ToLowerInvariant() }
$a = & $hash $body; $b = & $hash $embedded
Write-Host "FINANCE_MIGRATION_BODY_SHA256=$a"
Write-Host "FINANCE_DRY_RUN_BODY_SHA256=$b"
if ($a -ne $b) { exit 1 }
exit 0
