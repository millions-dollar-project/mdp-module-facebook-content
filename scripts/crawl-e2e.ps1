#requires -Version 5.1
<#
.SYNOPSIS
    Reproduces a Crawl click and verifies the 3 newest Facebook posts.
.PARAMETER PageUrl
    Public Facebook page URL to crawl.
.PARAMETER UntilDate
    Optional date filter. Empty means newest posts without a date cutoff.
.PARAMETER Limit
    Number of newest posts to return. Defaults to 3.
.PARAMETER ProfilePath
    Chrome profile used by the Crawl button. Empty uses the sidecar default.
.EXAMPLE
    .\scripts\crawl-e2e.ps1
.EXAMPLE
    .\scripts\crawl-e2e.ps1 -PageUrl "https://www.facebook.com/thietketruongmamnonecohome"
#>
[CmdletBinding()]
param(
    [string]$PageUrl = "https://www.facebook.com/thietketruongmamnonecohome",
    [string]$UntilDate = "",
    [int]$Limit = 3,
    [string]$ProfilePath = ""
)

$ErrorActionPreference = "Stop"
$sidecarPort = Get-Random -Minimum 19000 -Maximum 20000
$sidecarUrl = "http://127.0.0.1:$sidecarPort"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$sidecarLog = Join-Path $env:TEMP "mdp-sidecar-$(Get-Random).log"

if (-not $ProfilePath) {
    $profilesRoot = Join-Path $HOME ".mdp\facebook\profiles"
    $recentProfile = Get-ChildItem $profilesRoot -Directory -ErrorAction SilentlyContinue |
        ForEach-Object {
            $cookies = Get-Item (Join-Path $_.FullName "Default\Network\Cookies") -ErrorAction SilentlyContinue
            [pscustomobject]@{
                Directory = $_
                CookieTime = if ($cookies) { $cookies.LastWriteTime } else { [datetime]::MinValue }
            }
        } |
        Sort-Object CookieTime -Descending |
        Select-Object -First 1
    if ($recentProfile) {
        $ProfilePath = $recentProfile.Directory.FullName
        Write-Host "[e2e] using most recent account profile: $ProfilePath"
    } else {
        Write-Warning "[e2e] no account profile found; Facebook may return a limited logged-out page"
    }
}

$previousPort = $env:SIDECAR_PORT
$env:SIDECAR_PORT = [string]$sidecarPort
try {
    Write-Host "[e2e] starting isolated sidecar on :$sidecarPort"
    $sidecarProc = Start-Process `
        -FilePath "node" `
        -ArgumentList "src/index.js" `
        -WorkingDirectory (Join-Path $repoRoot "sidecar") `
        -RedirectStandardOutput $sidecarLog `
        -RedirectStandardError "$sidecarLog.err" `
        -PassThru -WindowStyle Hidden
}
finally {
    $env:SIDECAR_PORT = $previousPort
}

try {
    $ready = $false
    for ($i = 0; $i -lt 20; $i++) {
        if ($sidecarProc.HasExited) {
            $stderr = Get-Content "$sidecarLog.err" -Raw -ErrorAction SilentlyContinue
            throw "[e2e] sidecar exited during startup: $stderr"
        }
        try {
            $health = Invoke-WebRequest "$sidecarUrl/health" -UseBasicParsing -TimeoutSec 2
            if ($health.StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) {
        throw "[e2e] sidecar failed to start. Log: $sidecarLog"
    }

    $request = @{
        pageUrl = $PageUrl
        limit = $Limit
    }
    if ($UntilDate) {
        $request.untilDate = $UntilDate
    }
    if ($ProfilePath) {
        $request.profilePath = $ProfilePath
    }

    Write-Host "[e2e] reproducing Crawl: pageUrl=$PageUrl limit=$Limit untilDate=$UntilDate"
    $response = Invoke-RestMethod `
        -Uri "$sidecarUrl/crawl" `
        -Method POST `
        -ContentType "application/json" `
        -Body ($request | ConvertTo-Json -Compress)

    if (-not $response.success) {
        throw "[e2e] crawl failed: $($response.error)"
    }
    if ($response.posts.Count -ne $Limit) {
        Start-Sleep -Milliseconds 500
        Write-Host "----- sidecar diagnostics -----"
        Get-Content $sidecarLog -ErrorAction SilentlyContinue
        Get-Content "$sidecarLog.err" -ErrorAction SilentlyContinue
        Write-Host "----- end diagnostics -----"
        throw "[e2e] expected exactly $Limit posts, got $($response.posts.Count)"
    }

    $previousTime = [datetime]::MaxValue
    for ($i = 0; $i -lt $response.posts.Count; $i++) {
        $post = $response.posts[$i]
        $postedAt = [datetime]$post.postedAt
        if ($postedAt.Year -gt 1970 -and $previousTime.Year -gt 1970 -and $postedAt -gt $previousTime) {
            throw "[e2e] posts are not sorted newest-first at item $($i + 1)"
        }
        if (-not $post.permalink) {
            throw "[e2e] item $($i + 1) has no permalink"
        }
        if ($postedAt.Year -gt 1970) {
            $previousTime = $postedAt
        }
        Write-Host ("{0}. {1}" -f ($i + 1), $post.permalink)
        Write-Host ("   postedAt: {0}" -f $postedAt.ToString("o"))
        $preview = ([string]$post.fullContent -replace "\s+", " ").Trim()
        if ($preview.Length -gt 140) {
            $preview = $preview.Substring(0, 140) + "..."
        }
        Write-Host ("   content: {0}" -f $preview)
    }
    Write-Host "[e2e] PASS: exactly $Limit newest post URLs"
}
finally {
    if ($sidecarProc -and -not $sidecarProc.HasExited) {
        Stop-Process -Id $sidecarProc.Id -Force -ErrorAction SilentlyContinue
    }
}
