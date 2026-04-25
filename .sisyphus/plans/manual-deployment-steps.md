# Manual Deployment Steps

## Problem
The `opencode` binary at `~/.bun/bin/opencode.exe` is using the **cached npm version** (3.17.4), not our local fixes.

## Root Cause
Bun caches packages in `~/.bun/install/cache/` and the opencode binary uses these cached versions.

## Solution

You need to manually replace the cached oh-my-opencode with our local version.

### Step 1: Close OpenCode
Make sure OpenCode is not running.

### Step 2: Replace Cached Version

**Option A: Manual Copy (Windows)**
```cmd
rmdir /s /q C:\Users\jack\.bun\install\cache\oh-my-opencode@3.17.4@@@1
xcopy /E /I /Y C:\Users\jack\work\opencode-setup\local\oh-my-opencode C:\Users\jack\.bun\install\cache\oh-my-opencode@3.17.4@@@1
```

**Option B: Using PowerShell**
```powershell
Remove-Item -Path "$env:USERPROFILE\.bun\install\cache\oh-my-opencode@3.17.4@@@1" -Recurse -Force
Copy-Item -Path "$env:USERPROFILE\work\opencode-setup\local\oh-my-opencode" -Destination "$env:USERPROFILE\.bun\install\cache\oh-my-opencode@3.17.4@@@1" -Recurse -Force
```

**Option C: Using Git Bash/WSL**
```bash
rm -rf ~/.bun/install/cache/oh-my-opencode@3.17.4@@@1
cp -r ~/work/opencode-setup/local/oh-my-opencode ~/.bun/install/cache/oh-my-opencode@3.17.4@@@1
```

### Step 3: Clear Bun's Module Resolution Cache

```bash
rm -rf ~/.bun/install/cache/*.lock
```

Or on Windows:
```cmd
del /q %USERPROFILE%\.bun\install\cache\*.lock
```

### Step 4: Verify the Fix

Check that the cached version has our changes:

```bash
# Look for subagentSessions.add in sync-session-creator.js
grep "subagentSessions.add" ~/.bun/install/cache/oh-my-opencode@3.17.4@@@1/dist/tools/delegate-task/sync-session-creator.js

# Look for isMainSession import in model-persistence.js  
grep "isMainSession" ~/.bun/install/cache/oh-my-opencode@3.17.4@@@1/dist/hooks/model-persistence.js
```

### Step 5: Restart OpenCode

Start OpenCode again and test the model persistence.

---

## Alternative: Build and Install Locally

If the cache replacement doesn't work:

1. Build the local package:
```bash
cd local/oh-my-opencode
bun run build
```

2. Create a symlink in bun's global directory:
```bash
# Remove the cached version
rm -rf ~/.bun/install/cache/oh-my-opencode@3.17.4@@@1

# Create symlink
ln -s ~/work/opencode-setup/local/oh-my-opencode ~/.bun/install/cache/oh-my-opencode@3.17.4@@@1
```

Or on Windows (requires admin):
```cmd
rmdir /s /q C:\Users\jack\.bun\install\cache\oh-my-opencode@3.17.4@@@1
mklink /d C:\Users\jack\.bun\install\cache\oh-my-opencode@3.17.4@@@1 C:\Users\jack\work\opencode-setup\local\oh-my-opencode
```

---

## Verification

After deployment, you should be able to:

1. Run DCP (distill) 
2. See that your model stays the same
3. Not see the model switch to "oh-my-opencode"

The fixes we made:
1. ✅ `sync-session-creator.ts` - Tracks child sessions as subagents
2. ✅ `model-persistence.ts` - Uses proper `isMainSession()` check
3. ✅ `state.ts` - Exports proper `isMainSession()` function

These changes are in your local repo at `local/oh-my-opencode/`. They just need to be deployed to where bun loads them from.