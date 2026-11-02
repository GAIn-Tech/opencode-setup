$oldPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$newPath = ($oldPath -split ';' | Where-Object { $_ -notmatch 'WinGet.*opencode' }) -join ';'
[Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
Write-Host "Updated PATH. New value:"
Write-Host $newPath
