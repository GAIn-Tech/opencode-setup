[CmdletBinding()]
param(
    [string]$BunPath,
    [string]$ExpectedVersion = "1.3.9",
    [switch]$PersistUser
)

function Get-BunVersion([string]$Path) {
    try {
        return (& $Path --version).Trim()
    } catch {
        return ""
    }
}

if (-not $BunPath) {
    $candidates = @(
        "$env:LOCALAPPDATA\bun-bin\bun.exe",
        "$env:USERPROFILE\.bun\bin\bun.exe"
    )

    $selected = $null
    foreach ($candidate in $candidates) {
        $expanded = [System.Environment]::ExpandEnvironmentVariables($candidate)
        if (-not (Test-Path $expanded)) { continue }
        $ver = Get-BunVersion $expanded
        if ($ver -eq $ExpectedVersion) {
            $selected = $expanded
            break
        }
        if (-not $selected) {
            $selected = $expanded
        }
    }

    if (-not $selected) {
        Write-Error "No Bun binary found in known locations. Install Bun $ExpectedVersion first."
        exit 1
    }

    $resolved = $selected
} else {
    $resolved = [System.Environment]::ExpandEnvironmentVariables($BunPath)
}

if (-not (Test-Path $resolved)) {
    Write-Error "Bun binary not found at '$resolved'. Install Bun $ExpectedVersion first."
    exit 1
}

$resolvedVersion = Get-BunVersion $resolved
if ($resolvedVersion -and ($resolvedVersion -ne $ExpectedVersion)) {
    Write-Warning "Selected Bun path has version $resolvedVersion, expected $ExpectedVersion."
}

[Environment]::SetEnvironmentVariable("OPENCODE_BUN_PATH", $resolved, "Process")

if ($PersistUser) {
    [Environment]::SetEnvironmentVariable("OPENCODE_BUN_PATH", $resolved, "User")
    Write-Host "Set OPENCODE_BUN_PATH for User + Process scope: $resolved ($resolvedVersion)"
} else {
    Write-Host "Set OPENCODE_BUN_PATH for Process scope: $resolved ($resolvedVersion)"
    Write-Host "Tip: use -PersistUser to keep this across new shells."
}

Write-Host "Run: bun run verify"
