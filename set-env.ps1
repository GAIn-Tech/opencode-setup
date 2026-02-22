# Load .env and set environment variables (Process by default)
[CmdletBinding()]
param(
    [switch]$PersistUser
)

$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Error ".env file not found at $envFile"
    exit 1
}

Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^#][^=]+)=(.+)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        if ($PersistUser) {
            [Environment]::SetEnvironmentVariable($name, $value, 'User')
        }
        Write-Host "SET: $name"
    }
}
Write-Host "---VERIFY---"
Write-Host "Process environment variables loaded from .env"
if ($PersistUser) {
    Write-Host "User environment persistence enabled (-PersistUser)."
} else {
    Write-Host "User environment persistence disabled by default. Use -PersistUser to opt in."
}

# ---------------------------------------------------------------------------
# Config Sync: compare repo template (opencode-config/) vs live (~/.config/opencode/)
# ---------------------------------------------------------------------------
function Sync-OpenCodeConfig {
    param(
        [switch]$Push,   # copy repo -> live
        [switch]$Pull    # copy live -> repo
    )

    $repoDir  = Join-Path $PSScriptRoot "opencode-config"
    $liveDir  = if ($env:OPENCODE_CONFIG_HOME) { $env:OPENCODE_CONFIG_HOME } elseif ($env:APPDATA) { Join-Path $env:APPDATA "opencode" } else { "$env:USERPROFILE\.config\opencode" }

    # Shared config files that should be kept in sync
    $sharedFiles = @(
        "opencode.json",
        "antigravity.json",
        "oh-my-opencode.json",
        "compound-engineering.json",
        "supermemory.json",
        "rate-limit-fallback.json"
    )

    Write-Host ""
    Write-Host "=== OpenCode Config Sync ===" -ForegroundColor Cyan
    Write-Host "  Repo template : $repoDir"
    Write-Host "  Live config   : $liveDir"
    Write-Host ""

    $drifted = @()

    foreach ($file in $sharedFiles) {
        $repoFile = Join-Path $repoDir $file
        $liveFile = Join-Path $liveDir $file

        if (-not (Test-Path $repoFile)) {
            Write-Host "  MISSING (repo) : $file" -ForegroundColor Yellow
            continue
        }
        if (-not (Test-Path $liveFile)) {
            Write-Host "  MISSING (live) : $file" -ForegroundColor Yellow
            continue
        }

        $repoHash = (Get-FileHash $repoFile -Algorithm SHA256).Hash
        $liveHash = (Get-FileHash $liveFile -Algorithm SHA256).Hash

        if ($repoHash -eq $liveHash) {
            Write-Host "  OK             : $file" -ForegroundColor Green
        } else {
            Write-Host "  DRIFTED        : $file" -ForegroundColor Red
            $drifted += $file
        }
    }

    if ($drifted.Count -eq 0) {
        Write-Host ""
        Write-Host "All shared configs are in sync." -ForegroundColor Green
        return
    }

    Write-Host ""
    Write-Host "$($drifted.Count) file(s) have drifted." -ForegroundColor Yellow

    if ($Push) {
        Write-Host "Pushing repo -> live..." -ForegroundColor Cyan
        foreach ($file in $drifted) {
            Copy-Item (Join-Path $repoDir $file) (Join-Path $liveDir $file) -Force
            Write-Host "  Copied: $file (repo -> live)" -ForegroundColor Green
        }
    } elseif ($Pull) {
        Write-Host "Pulling live -> repo..." -ForegroundColor Cyan
        foreach ($file in $drifted) {
            Copy-Item (Join-Path $liveDir $file) (Join-Path $repoDir $file) -Force
            Write-Host "  Copied: $file (live -> repo)" -ForegroundColor Green
        }
    } else {
        Write-Host ""
        Write-Host "To fix drift, re-run with:" -ForegroundColor Yellow
        Write-Host "  Sync-OpenCodeConfig -Push    # repo -> live (use repo as source of truth)"
        Write-Host "  Sync-OpenCodeConfig -Pull    # live -> repo (use live as source of truth)"
    }
}

# Export alias for convenience
Set-Alias -Name sync-config -Value Sync-OpenCodeConfig
