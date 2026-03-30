# Remove WinGet opencode from current session PATH
$currentPath = $env:PATH -split ';'
$filteredPath = $currentPath | Where-Object { $_ -notmatch 'WinGet.*opencode' }
$env:PATH = $filteredPath -join ';'

# Verify
Write-Host "Updated. Checking opencode..."
& "C:\Users\jack\.bun\bin\opencode.exe" --version
