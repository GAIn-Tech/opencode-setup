# Fix Model Persistence for Global OpenCode Command

## TL;DR
> **Problem**: Global `opencode` command uses npm-published `oh-my-opencode@3.5.2` instead of local fixed version (3.16.0), causing model to switch after tool usage.
>
> **Solution**: Update `~/.config/opencode/opencode.json` to reference `local/oh-my-opencode` via file path instead of npm version.
>
> **Version Jump**: 3.5.2 → 3.16.0 (significant version increase, potential for unrelated changes)
>
> **Estimated Effort**: Short (1-4 hours with thorough verification)
> **Risk Level**: Medium (requires careful testing due to version jump)

---

## Context

### Current Situation
- **Global opencode**: Uses `~/.bun/bin/opencode.exe` which loads plugins from Bun cache
- **Plugin version**: Currently loading `oh-my-opencode@3.5.2` from npm/Bun cache
- **Fixed version**: Located at `C:/Users/jack/work/opencode-setup/local/oh-my-opencode/` with:
  - Fixed `isMainSession()` function (checks both subagentSessions AND backgroundSessions)
  - Proper session tracking in DCP/subagent creators
  - Built and ready at `dist/index.js`

### Root Cause
The global opencode loads plugins based on `opencode.json` config. Currently it references the npm version, not our local fixes.

### Target State
Global `opencode` command uses local fixed version from `file:../local/oh-my-opencode` path.

---

## Work Objectives

### Core Objective
Make the global `opencode` command use the local fixed `oh-my-opencode` that properly preserves session models.

### Concrete Deliverables
- [ ] Backup of current `opencode.json`
- [ ] Modified `opencode.json` with file path reference
- [ ] Verification that fix works
- [ ] Rollback procedure documented and tested

### Definition of Done
- [ ] Running DCP no longer switches the main session model
- [ ] Model persists after tool usage summaries
- [ ] Rollback can restore original state in < 2 minutes

### Must Have
- [ ] Backup before changes
- [ ] File path uses correct Windows/Unix format
- [ ] Bun resolves the path correctly
- [ ] Rollback script/command ready

### Must NOT Have (Guardrails)
- [ ] Do NOT delete or modify the npm cached version
- [ ] Do NOT change any other plugin references
- [ ] Do NOT modify local/oh-my-opencode package.json

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (bun test available)
- **Automated tests**: NO (manual verification sufficient)
- **Framework**: N/A

### Agent-Executed QA Scenarios (MANDATORY)

**Scenario 1: Verify local oh-my-opencode loads**
Tool: Bash
Preconditions: Config updated, opencode restarted
Steps:
1. Run: `opencode --version` or check plugin loading
2. Verify no npm cache path references to oh-my-opencode
3. Confirm local path appears in plugin resolution

Expected Result: Plugin loads from local path, not npm cache

**Scenario 2: Model persistence after DCP**
Tool: Playwright or manual
Preconditions: Main session running with preferred model (e.g., "claude-sonnet-4-5")
Steps:
1. Note current model: Check UI or ask "what model am I using?"
2. Trigger DCP: Use distill tool or wait for automatic activation
3. Wait for DCP completion message
4. Check model again

Expected Result: Model remains "claude-sonnet-4-5" (not switched to "oh-my-opencode")

**Scenario 3: Model persistence after continuation**
Tool: Manual
Preconditions: Session needs continuation
Steps:
1. Start a task that requires continuation
2. Let it continue
3. Check model after continuation message

Expected Result: Model remains unchanged

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Backup current config
├── Task 2: Verify local oh-my-opencode is built
└── Task 3: Prepare rollback script

Wave 2 (After Wave 1):
└── Task 4: Update opencode.json

Wave 3 (After Wave 2):
└── Task 5: Verify fix works

Critical Path: Task 1 → Task 4 → Task 5
```

---

## TODOs

- [ ] **1. Backup Current Config**
**What to do**:
- Store exact backup filename in environment variable for deterministic rollback
- **Windows PowerShell**: 
  ```powershell
  $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $env:BACKUP_FILE = "$env:USERPROFILE\.config\opencode\opencode.json.backup.$timestamp"
  Copy-Item "$env:USERPROFILE\.config\opencode\opencode.json" $env:BACKUP_FILE
  Write-Host "Backup created: $env:BACKUP_FILE"
  ```
- **Windows CMD**:
  ```batch
  set BACKUP_FILE=%USERPROFILE%\.config\opencode\opencode.json.backup.%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%
  copy "%USERPROFILE%\.config\opencode\opencode.json" "%BACKUP_FILE%"
  echo Backup created: %BACKUP_FILE%
  ```
- **Unix/Mac**:
  ```bash
  export BACKUP_FILE="$HOME/.config/opencode/opencode.json.backup.$(date +%Y%m%d_%H%M%S)"
  cp ~/.config/opencode/opencode.json "$BACKUP_FILE"
  echo "Backup created: $BACKUP_FILE"
  ```
- Verify backup file exists and is readable
- **CRITICAL**: Save the exact backup filename - you'll need it for rollback

**Must NOT do**:
- Don't use wildcard patterns for backup filenames
- Don't backup to temp directory
- Don't lose track of the exact backup filename

**Recommended Agent Profile**:
- **Category**: quick
- **Skills**: git-master

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1
- **Blocks**: Task 4
- **Blocked By**: None

**Acceptance Criteria**:
- [ ] Backup file exists at exact path stored in BACKUP_FILE env variable
- [ ] File is valid JSON
- [ ] Contains original oh-my-opencode@3.5.2 reference
- [ ] Backup filename is recorded and available for rollback

**Commit**: NO

---

- [ ] **2. Verify Local oh-my-opencode Build and Pin Integrity**
**What to do**:
- Check `C:/Users/jack/work/opencode-setup/local/oh-my-opencode/dist/index.js` exists
- Verify file is not empty (should be large bundle > 1MB)
- Check `local/oh-my-opencode/package.json` has correct name and version
- **CRITICAL**: Record integrity checkpoint before switching
  ```powershell
  # Get commit SHA
  cd C:\Users\jack\work\opencode-setup\local\oh-my-opencode
  git rev-parse HEAD > C:\Users\jack\work\opencode-setup\.sisyphus\omo-commit-sha.txt
  
  # Get dist/index.js file hash for integrity verification
  Get-FileHash dist\index.js -Algorithm SHA256 | Select-Object Hash > C:\Users\jack\work\opencode-setup\.sisyphus\omo-dist-hash.txt
  ```
- Save these hashes - they prove exactly what code was running

**Must NOT do**:
- Don't rebuild if already exists
- Don't modify any source files
- Don't skip integrity recording

**Recommended Agent Profile**:
- **Category**: quick
- **Skills**: git-master

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1
- **Blocks**: Task 4
- **Blocked By**: None

**Acceptance Criteria**:
- [ ] `dist/index.js` exists and > 1MB
- [ ] `dist/index.js` contains "isMainSession" function
- [ ] package.json has `"name": "oh-my-opencode"`
- [ ] Git commit SHA recorded in `.sisyphus/omo-commit-sha.txt`
- [ ] File hash of dist/index.js recorded in `.sisyphus/omo-dist-hash.txt`

**Commit**: NO

---

- [ ] **3. Prepare Rollback Script**
**What to do**:
- Create deterministic rollback using exact backup filename from Task 1
- **Windows PowerShell** (uses exact BACKUP_FILE env var):
  ```powershell
  Copy-Item $env:BACKUP_FILE "$env:USERPROFILE\.config\opencode\opencode.json" -Force
  Write-Host "Restored from: $env:BACKUP_FILE"
  ```
- **Windows CMD** (uses exact BACKUP_FILE env var):
  ```batch
  copy "%BACKUP_FILE%" "%USERPROFILE%\.config\opencode\opencode.json" /Y
  echo Restored from: %BACKUP_FILE%
  ```
- **Unix/Mac**:
  ```bash
  cp "$BACKUP_FILE" ~/.config/opencode/opencode.json
  echo "Restored from: $BACKUP_FILE"
  ```
- Store rollback command in a text file for easy access
- **CRITICAL**: Must use exact backup filename, NOT wildcards

**Must NOT do**:
- Don't use wildcard patterns (e.g., `backup.*`)
- Don't guess backup filename
- Don't auto-execute rollback

**Recommended Agent Profile**:
- **Category**: quick
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1
- **Blocks**: None
- **Blocked By**: Task 1

**Acceptance Criteria**:
- [ ] Rollback command documented using exact BACKUP_FILE variable
- [ ] No wildcards in rollback command
- [ ] Tested that backup file can be copied back manually
- [ ] Rollback command saved to accessible location

**Commit**: NO

---

- [ ] **4. Update opencode.json**
**What to do**:
- **BEFORE EDITING**: Test baseline - reproduce the bug
  - Start OpenCode with current config
  - Select preferred model (e.g., "claude-sonnet-4-5")
  - Trigger DCP
  - Confirm model switches (this proves the bug exists)
  - Record this observation
- Edit `~/.config/opencode/opencode.json`
- Change line 4 from: `"oh-my-opencode@3.5.2"` to: `"file:C:/Users/jack/work/opencode-setup/local/oh-my-opencode"`
- **Fallback**: If `file:C:/...` fails, try `"file:///C:/Users/jack/work/opencode-setup/local/oh-my-opencode"` (triple slash URI format)
- Ensure proper JSON syntax (trailing comma if needed)

**Must NOT do**:
- Don't change any other plugin references
- Don't use relative path - use absolute
- Don't use backslashes in path - use forward slashes
- Don't skip baseline reproduction

**Recommended Agent Profile**:
- **Category**: quick
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2
- **Blocks**: Task 5
- **Blocked By**: Task 1, Task 2

**Acceptance Criteria**:
- [ ] Baseline bug reproduction completed and documented
- [ ] Plugin array contains `"file:C:/Users/jack/work/opencode-setup/local/oh-my-opencode"`
- [ ] No reference to `oh-my-opencode@3.5.2` remains
- [ ] JSON is valid (no syntax errors)
- [ ] Fallback format documented if primary fails

**Commit**: NO (config file outside git)

---

- [ ] **5. Test Fix**
**What to do**:
- Restart OpenCode completely (kill all processes, start fresh)
- **CRITICAL**: Verify plugin loads from local path
  - Check startup logs for plugin resolution path
  - Confirm local path appears, not npm cache path
- Select preferred model
- **Test 1**: Trigger DCP
  - Run: "Use distill to compress context"
  - Wait for completion
  - Verify model unchanged
- **Test 2**: Trigger continuation
  - Start a task requiring continuation (e.g., "analyze this large codebase")
  - Let it continue
  - Verify model unchanged
- **Test 3**: Repeat DCP test 2 more times
  - Confirm consistent behavior
  - Document any failures

**Agent-Executed QA Scenario**:
Tool: Manual/Playwright
Preconditions: Config updated, OpenCode restarted, baseline reproduction done
Steps:
1. Start OpenCode
2. **Verify local plugin loaded**: Check startup logs/paths for local file reference
3. Note/confirm current model (ask "what model am I using?")
4. Run: "Use distill to compress context"
5. Wait for completion
6. Ask "what model am I using now?"
7. Verify model unchanged from step 3
8. Run: "Continue the previous task" (or start new long task)
9. Let it continue
10. Ask "what model am I using now?"
11. Verify model still unchanged
12. Repeat steps 4-7 two more times

Expected Result: Model persists (e.g., still "claude-sonnet-4-5" not "oh-my-opencode") across all tests

**Must NOT do**:
- Don't skip restart - cached plugins won't reload
- Don't test on subagent (that's expected to potentially switch)
- Don't skip verification of local plugin loading
- Don't stop after first successful test

**Recommended Agent Profile**:
- **Category**: quick
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 3
- **Blocks**: None
- **Blocked By**: Task 4

**Acceptance Criteria**:
- [ ] OpenCode loads without errors
- [ ] Local plugin path confirmed in startup logs/output
- [ ] Model can be selected manually
- [ ] After DCP (3x tests), model remains unchanged
- [ ] After continuation, model remains unchanged
- [ ] Comparison to baseline: previously model switched, now it doesn't

**Commit**: NO

---

## Rollback Strategy

### Immediate Rollback (If Issues Detected)

**⚠️ CRITICAL**: Use exact backup filename from BACKUP_FILE environment variable. Do NOT use wildcards.

**Command (PowerShell - RECOMMENDED)**:
```powershell
# Restore from exact backup
Copy-Item $env:BACKUP_FILE "$env:USERPROFILE\.config\opencode\opencode.json" -Force
Write-Host "Restored from: $env:BACKUP_FILE"

# Restart OpenCode
# (Close and reopen OpenCode completely)
```

**Command (Windows CMD)**:
```batch
copy "%BACKUP_FILE%" "%USERPROFILE%\.config\opencode\opencode.json" /Y
echo Restored from: %BACKUP_FILE%
```

**Command (Unix/Mac)**:
```bash
cp "$BACKUP_FILE" ~/.config/opencode/opencode.json
echo "Restored from: $BACKUP_FILE"
```

### Rollback Without OpenCode Running
If OpenCode won't start after config change:

**PowerShell**:
```powershell
# Restore even if OpenCode is broken
Copy-Item $env:BACKUP_FILE "$env:USERPROFILE\.config\opencode\opencode.json" -Force
# Then start OpenCode normally
```

### Verification After Rollback
1. Check `opencode.json` contains `"oh-my-opencode@3.5.2"`
   ```powershell
   Get-Content $env:USERPROFILE\.config\opencode\opencode.json | Select-String "oh-my-opencode"
   ```
2. Restart OpenCode
3. Verify it loads without errors
4. Confirm you're back to npm version (3.5.2)

---

## Success Criteria

### Verification Commands

**Before Fix**:
```bash
# Check current config
cat ~/.config/opencode/opencode.json | grep "oh-my-opencode"
# Expected: "oh-my-opencode@3.5.2"
```

**After Fix**:
```bash
# Check updated config
cat ~/.config/opencode/opencode.json | grep "oh-my-opencode"
# Expected: "file:C:/Users/jack/work/opencode-setup/local/oh-my-opencode"
```

**Functional Test**:
1. Start OpenCode with preferred model
2. Use DCP (distill tool)
3. Confirm model hasn't switched

### Final Checklist
- [ ] Backup created successfully
- [ ] Config updated to use local path
- [ ] OpenCode loads without errors
- [ ] Model persists after DCP/continuation
- [ ] Rollback procedure tested

---

## Notes

### Path Format
- Use forward slashes (`/`) even on Windows: `file:C:/Users/jack/...`
- Bun handles the path resolution correctly

### Why This Works
Bun's `file:` protocol loads packages directly from the filesystem instead of npm registry. This means:
1. No publishing required
2. Changes in `local/oh-my-opencode` are immediately available
3. Just need to restart OpenCode to pick up changes

### Alternative: Symlink/Junction (Not Recommended)
Could create junction from Bun cache to local directory, but:
- More complex
- Cache clearing could break it
- Harder to rollback

File protocol is cleaner and purpose-built for this use case.
