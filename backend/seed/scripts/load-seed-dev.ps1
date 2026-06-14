# load-seed-dev.ps1 — bootstrap a fresh dev DB with the seed data (Windows).
#
# Reads FB_PAGE_ACCESS_TOKEN from the environment (or .env), substitutes
# the placeholder in seed-dev.sql, and pipes the result to psql.
#
# Idempotent: re-running is a no-op (ON CONFLICT DO NOTHING).

[CmdletBinding()]
param(
    [string]$SeedFile,
    [string]$DbUrl
)

$ErrorActionPreference = "Stop"

# ─── Resolve repo-relative paths regardless of CWD ─────────────────────────
if (-not $SeedFile) {
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $SeedDir = Split-Path -Parent $ScriptDir
    $SeedFile = Join-Path $SeedDir "seed-dev.sql"
}
if (-not (Test-Path $SeedFile)) {
    Write-Error "seed file not found: $SeedFile"
    exit 1
}

# ─── Load .env if present ─────────────────────────────────────────────────
$EnvFile = Join-Path (Split-Path -Parent (Split-Path -Parent $SeedFile)) ".env"
if (-not $env:FB_PAGE_ACCESS_TOKEN -and (Test-Path $EnvFile)) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]*)\s*=\s*(.*)\s*$") {
            $name = $matches[1].Trim()
            $val = $matches[2].Trim().Trim('"').Trim("'")
            if (-not [string]::IsNullOrEmpty($name) -and -not $env:${name}) {
                Set-Item -Path "env:$name" -Value $val
            }
        }
    }
}

if (-not $env:FB_PAGE_ACCESS_TOKEN) {
    Write-Error "FB_PAGE_ACCESS_TOKEN is not set.`n  setx FB_PAGE_ACCESS_TOKEN ""EAA..."" or put it in backend/.env"
    exit 1
}

# ─── Resolve DATABASE_URL ────────────────────────────────────────────────
if (-not $DbUrl -and -not $env:DATABASE_URL) {
    if (Test-Path $EnvFile) {
        Get-Content $EnvFile | ForEach-Object {
            if ($_ -match "^\s*DATABASE_URL\s*=\s*(.*)\s*$") {
                $script:DbUrl = $matches[1].Trim().Trim('"').Trim("'")
            }
        }
    }
}
if (-not $DbUrl -and -not $env:DATABASE_URL) {
    $DbUrl = "postgres://facebook:facebook@localhost:5433/facebook?sslmode=disable"
    Write-Host "info: DATABASE_URL not set, using default: $DbUrl"
}

# ─── Substitute placeholder, pipe to psql ─────────────────────────────────
$tmp = [System.IO.Path]::GetTempFileName()
try {
    (Get-Content $SeedFile -Raw) -replace '__SEED_PAGE_ACCESS_TOKEN__', $env:FB_PAGE_ACCESS_TOKEN | Set-Content -NoNewline $tmp

    Write-Host "loading seed into $DbUrl ..."
    & psql $DbUrl -v ON_ERROR_STOP=1 -f $tmp
    if ($LASTEXITCODE -ne 0) { throw "psql failed with exit $LASTEXITCODE" }

    Write-Host "done."
} finally {
    Remove-Item -Force $tmp -ErrorAction SilentlyContinue
}
