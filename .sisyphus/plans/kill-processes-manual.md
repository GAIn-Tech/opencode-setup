# Manual Process Kill Required

## Problem
Git Bash is converting `/PID` to `C:/Program Files/Git/PID`, causing taskkill to fail.

## Solution - Manual Kill Required

You have **8 opencode processes** and **21 bun processes** running with old cached code.

### Method 1: Task Manager (Easiest)

1. Press `Ctrl + Shift + Esc` to open Task Manager
2. Click "More details" if in simple view
3. Go to "Processes" tab
4. Click on "Name" column to sort alphabetically
5. Find all processes starting with:
   - `opencode` (8 processes)
   - `bun` (21 processes)
6. Select them all (Ctrl+Click to multi-select)
7. Right-click → "End task"

### Method 2: PowerShell (Copy-Paste Each Line)

Open PowerShell as Administrator and run these commands ONE AT A TIME:

```powershell
# Kill opencode processes
Stop-Process -Id 16092 -Force
Stop-Process -Id 33312 -Force
Stop-Process -Id 71180 -Force
Stop-Process -Id 9952 -Force
Stop-Process -Id 64360 -Force
Stop-Process -Id 51060 -Force
Stop-Process -Id 70156 -Force
Stop-Process -Id 69924 -Force

# Kill bun processes
Stop-Process -Id 59008 -Force
Stop-Process -Id 59512 -Force
Stop-Process -Id 34492 -Force
Stop-Process -Id 59040 -Force
Stop-Process -Id 62012 -Force
Stop-Process -Id 6148 -Force
Stop-Process -Id 40624 -Force
Stop-Process -Id 66496 -Force
Stop-Process -Id 43508 -Force
Stop-Process -Id 58888 -Force
Stop-Process -Id 43888 -Force
Stop-Process -Id 42740 -Force
Stop-Process -Id 75016 -Force
Stop-Process -Id 59900 -Force
Stop-Process -Id 52080 -Force
Stop-Process -Id 36128 -Force
Stop-Process -Id 54620 -Force
Stop-Process -Id 70568 -Force
Stop-Process -Id 32828 -Force
Stop-Process -Id 67884 -Force
Stop-Process -Id 56476 -Force
Stop-Process -Id 30616 -Force
```

### Method 3: Command Prompt

Open CMD as Administrator and run:

```cmd
taskkill /F /IM opencode.exe
taskkill /F /IM bun.exe
taskkill /F /IM bunx.exe
```

## Verify All Killed

After killing, run this in PowerShell to verify:

```powershell
Get-Process | Where-Object { $_.Name -like "*opencode*" -or $_.Name -like "*bun*" } | Select-Object Name, Id
```

If nothing shows up, all processes are killed.

## Restart OpenCode

After killing all processes:

1. Open a new terminal
2. Run: `opencode`
3. The fixes will be active!

## Test

1. Select your preferred model
2. Run DCP (distill)
3. Your model should **stay the same**!

---

**Summary:**
- ✅ Fixes are deployed in cache
- ❌ Old processes still running with old code
- 🎯 Kill processes → Restart OpenCode → Test