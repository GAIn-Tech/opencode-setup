# Windows Symlink Deployment (Bypassing NUL File Issue)

## The Problem
Windows has reserved device names (`NUL`, `CON`, `PRN`, `AUX`, etc.) that cannot be used as filenames. The copy is failing because the source contains files named `nul`.

## Solution: Use Symlinks Instead of Copy

### Option 1: Create Directory Junction (Recommended)

Run in **Command Prompt as Administrator**:

```cmd
:: Remove the old cached version
rmdir /s /q C:\Users\jack\.bun\install\cache\oh-my-opencode@3.17.4@@@1

:: Create a directory junction (symlink for directories)
mklink /j C:\Users\jack\.bun\install\cache\oh-my-opencode@3.17.4@@@1 C:\Users\jack\work\opencode-setup\local\oh-my-opencode
```

Or in **PowerShell as Administrator**:

```powershell
# Remove old version
Remove-Item -Path "$env:USERPROFILE\.bun\install\cache\oh-my-opencode@3.17.4@@@1" -Recurse -Force -ErrorAction SilentlyContinue

# Create junction
New-Item -ItemType Junction -Path "$env:USERPROFILE\.bun\install\cache\oh-my-opencode@3.17.4@@@1" -Target "$env:USERPROFILE\work\opencode-setup\local\oh-my-opencode"
```

### Option 2: Robocopy (Excludes Problematic Files)

Run in **Command Prompt**:

```cmd
:: Remove old version
rmdir /s /q C:\Users\jack\.bun\install\cache\oh-my-opencode@3.17.4@@@1

:: Copy using robocopy (skips files it can't copy)
robocopy C:\Users\jack\work\opencode-setup\local\oh-my-opencode C:\Users\jack\.bun\install\cache\oh-my-opencode@3.17.4@@@1 /E /R:1 /W:1 /XD node_modules
```

**Note**: Robocopy will skip the `nul` files and continue. The important code files (TypeScript/JS) will be copied.

### Option 3: Manual Xcopy with Exclusions

Create a list of files to exclude, then:

```cmd
:: Create exclusion file
echo nul > exclude.txt
echo con >> exclude.txt
echo prn >> exclude.txt

:: Copy with exclusions
xcopy /E /I /Y /EXCLUDE:exclude.txt C:\Users\jack\work\opencode-setup\local\oh-my-opencode C:\Users\jack\.bun\install\cache\oh-my-opencode@3.17.4@@@1

:: Clean up
 del exclude.txt
```

---

## Verification

After deployment, verify the fixes are in place:

```cmd
:: Check that sync-session-creator has the fix
findstr "subagentSessions.add" C:\Users\jack\.bun\install\cache\oh-my-opencode@3.17.4@@@1\dist\tools\delegate-task\sync-session-creator.js

:: Check that model-persistence has the fix
findstr "isMainSession" C:\Users\jack\.bun\install\cache\oh-my-opencode@3.17.4@@@1\dist\hooks\model-persistence.js
```

---

## Alternative: Develop in Cache Directly

If symlinks don't work, you can develop directly in the cache:

```cmd
:: Navigate to cache
cd C:\Users\jack\.bun\install\cache\oh-my-opencode@3.17.4@@@1

:: Make edits here instead of in local/oh-my-opencode
:: Then rebuild: bun run build
```

But be careful - bun may overwrite this on package updates.

---

## Recommended Approach

**Use Option 1 (Directory Junction)** - it's the cleanest solution:

1. Your local `local/oh-my-opencode/` becomes the source of truth
2. The cache location is just a pointer to your local code
3. Any changes you make locally are immediately reflected
4. No need to re-copy after each edit

**Run as Administrator** and use:

```cmd
mklink /j C:\Users\jack\.bun\install\cache\oh-my-opencode@3.17.4@@@1 C:\Users\jack\work\opencode-setup\local\oh-my-opencode
```