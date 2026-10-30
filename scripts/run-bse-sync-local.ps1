# scripts/run-bse-sync-local.ps1
#
# Runs the two BSE index jobs (sync_bse_index_cache.js, build-bse-index-dashboard.mjs)
# from this machine instead of GitHub Actions. BSE's Akamai WAF started blocking
# GitHub Actions' runner IPs on 2026-10-28 (the same block it already applied to
# Vercel's IPs earlier in October) -- a normal home/office network isn't on that
# blocklist, so running from here sidesteps it entirely. See lib/bseIndex.js's
# header comment for the full history.
#
# Registered as a daily Windows Scheduled Task ("BSE Index Sync") via
# Register-ScheduledTask -- see the setup command in the commit that added this
# file. Requires this machine to be on and logged in around the scheduled time;
# if missed, Task Scheduler's "run as soon as possible after a missed start" is
# enabled so it catches up on next login.
#
# Env vars are read from .env.local (not committed) -- same values the two
# GitHub Actions workflows used as repo secrets.

$RepoRoot = "D:\workspace\MF-Analyzer-Abundance"
$LogDir = Join-Path $RepoRoot "scripts\bse-sync-logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("bse-sync-{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))

Set-Location $RepoRoot

# Load .env.local into the process environment (KEY=VALUE lines, '#' comments skipped)
Get-Content (Join-Path $RepoRoot ".env.local") | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $parts = $_ -split '=', 2
    $key = $parts[0].Trim()
    $val = $parts[1].Trim().Trim('"')
    if ($key) { [System.Environment]::SetEnvironmentVariable($key, $val, "Process") }
}

"=== BSE local sync run: $(Get-Date -Format o) ===" | Tee-Object -FilePath $LogFile -Append

node scripts/sync_bse_index_cache.js 2>&1 | Tee-Object -FilePath $LogFile -Append
node scripts/build-bse-index-dashboard.mjs 2>&1 | Tee-Object -FilePath $LogFile -Append

"=== Done: $(Get-Date -Format o) ===" | Tee-Object -FilePath $LogFile -Append
