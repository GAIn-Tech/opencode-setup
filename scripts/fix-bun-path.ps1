[CmdletBinding()]
param(
    [string]$BunPath = "$env:LOCALAPPDATA\bun-bin\bun.exe",
    [switch]$PersistUser
)

$resolved = [System.Environment]::ExpandEnvironmentVariables($BunPath)

if (-not (Test-Path $resolved)) {
    Write-Error "Bun binary not found at '$resolved'. Install Bun 1.3.9 first."
    exit 1
}

[Environment]::SetEnvironmentVariable("OPENCODE_BUN_PATH", $resolved, "Process")

if ($PersistUser) {
    [Environment]::SetEnvironmentVariable("OPENCODE_BUN_PATH", $resolved, "User")
    Write-Host "Set OPENCODE_BUN_PATH for User + Process scope: $resolved"
} else {
    Write-Host "Set OPENCODE_BUN_PATH for Process scope: $resolved"
    Write-Host "Tip: use -PersistUser to keep this across new shells."
}

Write-Host "Run: bun run verify"
