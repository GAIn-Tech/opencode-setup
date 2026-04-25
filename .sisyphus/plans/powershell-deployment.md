# PowerShell Deployment Commands

## The Issue
You're in PowerShell, not Command Prompt. PowerShell uses different syntax.

## PowerShell Commands

Run these in **PowerShell as Administrator**:

```powershell
# Step 1: Remove old cached version
Remove-Item -Path "$env:USERPROFILE\.bun\install\cache\oh-my-opencode@3.17.4@@@1" -Recurse -Force -ErrorAction SilentlyContinue

# Step 2: Create directory junction (symlink)
New-Item -ItemType Junction -Path "$env:USERPROFILE\.bun\install\cache\oh-my-opencode@3.17.4@@@1" -Target "$env:USERPROFILE\work\opencode-setup\local\oh-my-opencode" -Force

# Step 3: Verify it worked
Test-Path "$env:USERPROFILE\.bun\install\cache\oh-my-opencode@3.17.4@@@1\dist\hooks\model-persistence.js"

# Step 4: Check the fix is there
Get-Content "$env:USERPROFILE\.bun\install\cache\oh-my-opencode@3.17.4@@@1\dist\hooks\model-persistence.js" | Select-String "isMainSession" | Select-Object -First 3
```

## Alternative: Command Prompt

If you prefer Command Prompt, open **cmd.exe as Administrator** and run:

```cmd
rmdir /s /q "C:\Users\jack\.bun\install\cache\oh-my-opencode@3.17.4@@@1"
mklink /j "C:\Users\jack\.bun\install\cache\oh-my-opencode@3.17.4@@@1" "C:\Users\jack\work\opencode-setup\local\oh-my-opencode"
```

## Verify

After running either set of commands, verify:

```powershell
# Check if junction exists
Get-Item "$env:USERPROFILE\.bun\install\cache\oh-my-opencode@3.17.4@@@1" | Select-Object FullName, Target

# Check for model-persistence fix
Get-Content "$env:USERPROFILE\.bun\install\cache\oh-my-opencode@3.17.4@@@1\dist\hooks\model-persistence.js" | Select-String "isMainSession"

# Check for sync-session-creator fix  
Get-Content "$env:USERPROFILE\.bun\install\cache\oh-my-opencode@3.17.4@@@1\dist\tools\delegate-task\sync-session-creator.js" | Select-String "subagentSessions.add"
```

## Troubleshooting

If you get "Access Denied", make sure you're running as Administrator.

If junction creation fails, try:

```powershell
# Alternative: Create symbolic link instead of junction
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.bun\install\cache\oh-my-opencode@3.17.4@@@1" -Target "$env:USERPROFILE\work\opencode-setup\local\oh-my-opencode" -Force
```