# Disaster Recovery System Implementation Plan

## TL;DR

**Quick Summary:** Build a Git-style backup and recovery system for opencode that guarantees recovery from ThreadLock crashes, DB corruption, or any startup failure. Creates immutable snapshots before config/dependency changes with 7-backup rotation and manual recovery CLI.

**Deliverables:**
- Pre-flight validation script (`~/.opencode-dr/validate.py`)
- Backup creation script (`~/.opencode-dr/backup.sh`)
- Recovery CLI (`~/.opencode-dr/recover.sh`)
- Emergency minimal config (`~/.opencode-dr/emergency-config/`)
- Health check suite (`~/.opencode-dr/health-checks/`)
- Git pre-commit hook for automatic backups

**Estimated Effort:** Medium (~2-3 hours)
**Parallel Execution:** YES - Tasks 1-3 can run in parallel, Tasks 4-6 sequential
**Critical Path:** Task 1 → Task 4 → Task 6

---

## Context

### Original Request
User wants guaranteed recoverability when opencode can't start due to corruption (ThreadLock, OOM, segfaults). Need manual recovery process that restores to fully working state: opencode starts, all plugins load, full agent functionality, learning accumulation/KG and skills pipeline intact.

### Requirements Confirmed
- **Git-style backups** before config or major dependency edits
- **7 backups retention** (configurable)
- **Scope:** `~/.config/opencode/` + `~/.local/share/opencode/opencode.db`
- **Success Criteria:**
  - opencode starts without crash
  - All 7 plugins load (oh-my-opencode, antigravity-auth, quota, supermemory, preload-skills, langfuse, pty)
  - Full agent functionality (8 agents: atlas, hephaestus, librarian, metis, momus, oracle, prometheus, sisyphus)
  - Learning accumulation/KG intact
  - Skills pipeline functional
- **Manual recovery** (user-controlled)
- **Linked to opencode-setup version** (config + DB state)

### Current Working State (Post-Fix)
- opencode version: 1.2.11
- oh-my-opencode: 3.5.2 (via loader workaround)
- All plugins: installed and functional
- DB size: ~2.15GB
- Working directory: `C:/Users/jack/work/opencode-setup`

---

## Work Objectives

### Core Objective
Create a bulletproof disaster recovery system that can restore opencode to fully working state even when it won't start, using only external tools (Python/Bash) that don't depend on opencode or Bun.

### Concrete Deliverables
1. **Pre-flight validation script** - Run before any change, catches issues before they cause crashes
2. **Backup system** - Git-style snapshots with 7-backup rotation, compressed storage
3. **Recovery CLI** - Interactive manual recovery with multiple rollback options
4. **Emergency minimal config** - Bare-bones opencode that always starts
5. **Health check suite** - Automated validation of all success criteria
6. **Integration hooks** - Git pre-commit hook for automatic backups

### Definition of Done
- [x] User can run `~/.opencode-dr/backup.sh` to create timestamped snapshot
- [x] User can run `~/.opencode-dr/recover.sh` to restore when opencode crashes
- [x] Recovery restores to state where:
  - `opencode --version` returns without error
  - All 7 plugins load in startup log
  - 8 agents appear in tab menu (@atlas, @hephaestus, etc.)
  - Learning engine shows previous session data
  - Skills (46 total) are available via `/skill` command
- [x] Emergency minimal config can start opencode even with broken plugins

### Must Have
- External tools only (Python 3.10+, Bash, standard Unix tools)
- No opencode/Bun dependencies for recovery
- Manual user-controlled recovery process
- Atomic backups (all-or-nothing snapshots)
- Compression to minimize storage

### Must NOT Have (Guardrails)
- Automatic rollback without user confirmation
- Real-time monitoring daemons (complexity, resource usage)
- Modification of opencode core behavior
- Loss of any existing configuration or learning data

---

## Verification Strategy

### Test Decision
- **Infrastructure exists:** YES (Bun test framework in opencode-setup)
- **Automated tests:** Tests-after (no TDD needed for shell scripts)
- **Framework:** Bun test for validation, Bash scripts for integration

### Agent-Executed QA Scenarios

**Scenario 1: Backup Creates Recoverable Snapshot**
```
Tool: Bash
Preconditions: opencode running, all plugins loaded
Steps:
1. Run ~/.opencode-dr/backup.sh "pre-test-backup"
2. Assert backup directory exists: ~/.opencode-dr/backups/YYYY-MM-DD-HHMMSS-pre-test-backup/
3. Assert contains: config/, node_modules/, db/opencode.db
4. Assert manifest.json exists with checksums
Expected Result: Backup created successfully with all required files
Evidence: ls -la ~/.opencode-dr/backups/
```

**Scenario 2: Recovery From Simulated Corruption**
```
Tool: Bash
Preconditions: Backup exists, opencode currently working
Steps:
1. Create backup: backup.sh "baseline"
2. Simulate corruption: echo "garbage" >> ~/.config/opencode/opencode.json
3. Run ~/.opencode-dr/recover.sh
4. Select backup "baseline" from menu
5. Assert opencode --version succeeds
6. Assert plugins load in fresh opencode start
Expected Result: Corruption fixed, opencode functional
Evidence: Recovery log, opencode startup log
```

**Scenario 3: Emergency Minimal Mode**
```
Tool: Bash
Preconditions: opencode broken ( ThreadLock simulation)
Steps:
1. Create .env file in CWD (known crash trigger)
2. Run ~/.opencode-dr/recover.sh --minimal
3. Assert creates ~/.opencode-dr/emergency-config/
4. Assert opencode starts with minimal plugins
5. Remove .env file
6. Run recover.sh --restore-from-emergency
Expected Result: Minimal mode works even with broken config
Evidence: opencode starts, basic prompt appears
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Independent):
├── Task 1: Create backup directory structure
├── Task 2: Create emergency minimal config
└── Task 3: Create health check modules

Wave 2 (After Wave 1):
├── Task 4: Implement backup creation script
├── Task 5: Implement pre-flight validation
└── Task 6: Implement recovery CLI

Wave 3 (After Wave 2):
└── Task 7: Integration and testing
```

### Dependency Matrix

| Task | Depends On | Blocks | Parallel Group |
|------|------------|--------|----------------|
| 1 | None | 4,5,6 | Wave 1 |
| 2 | None | 4 | Wave 1 |
| 3 | None | 5 | Wave 1 |
| 4 | 1,2 | 7 | Wave 2 |
| 5 | 1,3 | 7 | Wave 2 |
| 6 | 1 | 7 | Wave 2 |
| 7 | 4,5,6 | None | Wave 3 |

---

## TODOs

### Task 1: Create Backup Directory Structure

**What to do:**
- Create `~/.opencode-dr/` directory hierarchy
- Set up 7-backup rotation structure
- Create base manifest format

**Must NOT do:**
- Don't backup yet (Task 4 does actual backup)
- Don't modify existing opencode config

**Recommended Agent Profile:**
- **Category:** quick
- **Skills:** []
- **Reason:** Simple directory creation and structure setup

**Parallelization:**
- **Can Run In Parallel:** YES
- **Parallel Group:** Wave 1
- **Blocks:** Task 4, 5, 6
- **Blocked By:** None

**References:**
- `opencode-setup/AGENTS.md` - File structure conventions
- Claude Code session: bun-report crash analysis (ThreadLock pattern)

**Acceptance Criteria:**
- [x] Directory exists: `~/.opencode-dr/`
- [x] Subdirectories: `backups/`, `emergency-config/`, `health-checks/`, `logs/`
- [x] File exists: `~/.opencode-dr/.gitignore` (ignores large DB files from git)
- [x] File exists: `~/.opencode-dr/README.md` (usage instructions)

**Agent-Executed QA:**
```
Scenario: Directory structure created
Tool: Bash
Preconditions: None
Steps:
1. Run: mkdir -p ~/.opencode-dr/{backups,emergency-config,health-checks,logs}
2. Assert all directories exist
3. Assert .gitignore created with "*.db\n*.db-wal\nnode_modules/"
Expected Result: Structure ready for backups
Evidence: ls -la ~/.opencode-dr/
```

**Commit:** YES
- Message: `feat(dr): create disaster recovery directory structure`
- Files: `.opencode-dr/` directory

---

### Task 2: Create Emergency Minimal Config

**What to do:**
- Create bare-bones opencode.json that always starts
- Strip all plugins except essential
- Include only critical provider (Google with free tier)

**Must NOT do:**
- Don't include oh-my-opencode (may be source of crash)
- Don't include any optional plugins
- Don't include skills directory reference if it causes issues

**Recommended Agent Profile:**
- **Category:** quick
- **Skills:** []
- **Reason:** JSON config creation based on working opencode.json

**Parallelization:**
- **Can Run In Parallel:** YES
- **Parallel Group:** Wave 1
- **Blocks:** Task 4
- **Blocked By:** None

**References:**
- `~/.config/opencode/opencode.json` - Working config reference
- `packages/opencode-dashboard/` - For API endpoints

**Acceptance Criteria:**
- [x] File: `~/.opencode-dr/emergency-config/opencode.json`
- [x] Contains: Only @opencode-ai/plugin, no optional plugins
- [x] Contains: Google provider with gemini-2.5-flash (free tier)
- [x] Contains: Basic MCP servers (supermemory, context7)
- [x] File: `~/.opencode-dr/emergency-config/oh-my-opencode.json` (empty but valid)

**Agent-Executed QA:**
```
Scenario: Emergency config loads successfully
Tool: Bash
Steps:
1. Create test directory: mkdir -p /tmp/opencode-test
2. Copy emergency config: cp ~/.opencode-dr/emergency-config/* /tmp/opencode-test/
3. Run: cd /tmp && opencode --config /tmp/opencode-test/opencode.json --version
4. Assert returns version without crash
Expected Result: Emergency config works in isolation
Evidence: Command output, no ThreadLock
```

**Commit:** YES
- Message: `feat(dr): add emergency minimal configuration`
- Files: `.opencode-dr/emergency-config/*`

---

### Task 3: Create Health Check Modules

**What to do:**
- Create Python modules for each health check
- Check 1: .env files in CWD (ThreadLock trigger)
- Check 2: SQLite DB integrity
- Check 3: Plugin version mismatches
- Check 4: WAL file size (corruption indicator)
- Check 5: Node_modules consistency

**Must NOT do:**
- Don't check things that require opencode to run
- Don't use Bun for checks (may be broken)

**Recommended Agent Profile:**
- **Category:** quick
- **Skills:** []
- **Reason:** Python scripting with standard library only

**Parallelization:**
- **Can Run In Parallel:** YES
- **Parallel Group:** Wave 1
- **Blocks:** Task 5
- **Blocked By:** None

**References:**
- Claude Code session: ThreadLock crash analysis
- `packages/opencode-crash-guard/src/spawn-guard.js` - ENOENT patterns
- `~/.config/opencode/package.json` - Plugin versions

**Acceptance Criteria:**
- [x] File: `~/.opencode-dr/health-checks/check_env_files.py`
- [x] File: `~/.opencode-dr/health-checks/check_db_integrity.py`
- [x] File: `~/.opencode-dr/health-checks/check_plugin_versions.py`
- [x] File: `~/.opencode-dr/health-checks/check_wal_size.py`
- [x] File: `~/.opencode-dr/health-checks/check_node_modules.py`
- [x] File: `~/.opencode-dr/health-checks/__init__.py` (runner)

**Agent-Executed QA:**
```
Scenario: Health checks detect known issues
Tool: Bash
Steps:
1. Create test .env file in CWD: echo "test" > /tmp/test/.env
2. Run: cd /tmp/test && python3 ~/.opencode-dr/health-checks/check_env_files.py
3. Assert exit code 1, outputs "FAIL: .env file detected"
4. Remove .env file
5. Run check again
6. Assert exit code 0, outputs "PASS"
Expected Result: Checks catch ThreadLock trigger
Evidence: Command output, exit codes
```

**Commit:** YES
- Message: `feat(dr): add health check validation suite`
- Files: `.opencode-dr/health-checks/*.py`

---

### Task 4: Implement Backup Creation Script

**What to do:**
- Create `~/.opencode-dr/backup.sh` script
- Accept optional commit message argument
- Copy config, node_modules, and DB to timestamped directory
- Create manifest.json with checksums
- Enforce 7-backup rotation (delete oldest)
- Compress with zstd if available

**Must NOT do:**
- Don't backup if health checks fail
- Don't overwrite existing backup with same name
- Don't follow symlinks (copy targets instead)

**Recommended Agent Profile:**
- **Category:** quick
- **Skills:** []
- **Reason:** Bash scripting with rsync/tar

**Parallelization:**
- **Can Run In Parallel:** NO (depends on Task 1, 2)
- **Parallel Group:** Wave 2
- **Blocks:** Task 7
- **Blocked By:** Task 1, Task 2

**References:**
- `~/.config/opencode/` - Source files to backup
- `~/.local/share/opencode/opencode.db` - Database to backup
- Claude Code session: Version fix for oh-my-opencode

**Acceptance Criteria:**
- [x] File: `~/.opencode-dr/backup.sh` (executable)
- [x] Usage: `./backup.sh "optional-message"`
- [x] Creates: `~/.opencode-dr/backups/YYYY-MM-DD-HHMMSS-message/`
- [x] Contains: manifest.json, config/, node_modules/, db/
- [x] Implements: 7-backup rotation (ls -t | tail -n +8 | xargs rm -rf)
- [x] Optional: Compresses with zstd

**Agent-Executed QA:**
```
Scenario: Backup creation and rotation
Tool: Bash
Steps:
1. Run: ~/.opencode-dr/backup.sh "test-backup-1"
2. Assert backup directory created with timestamp
3. Run 8 more backups with different names
4. Assert only 7 backups exist (oldest deleted)
5. Check manifest.json contains SHA256 checksums
Expected Result: Rotation working, storage bounded
Evidence: ls -la ~/.opencode-dr/backups/
```

**Commit:** YES
- Message: `feat(dr): implement backup creation with rotation`
- Files: `.opencode-dr/backup.sh`

---

### Task 5: Implement Pre-flight Validation

**What to do:**
- Create `~/.opencode-dr/validate.sh` script
- Run all health checks from Task 3
- Report FAIL/PASS for each check
- Exit non-zero if any check fails
- Provide actionable remediation hints

**Must NOT do:**
- Don't auto-fix issues (manual process only)
- Don't continue if validation fails

**Recommended Agent Profile:**
- **Category:** quick
- **Skills:** []
- **Reason:** Integration of health checks into workflow

**Parallelization:**
- **Can Run In Parallel:** NO (depends on Task 1, 3)
- **Parallel Group:** Wave 2
- **Blocks:** Task 7
- **Blocked By:** Task 1, Task 3

**References:**
- `~/.opencode-dr/health-checks/` - Health check modules from Task 3
- Claude Code session: Crash prevention patterns

**Acceptance Criteria:**
- [x] File: `~/.opencode-dr/validate.sh` (executable)
- [x] Runs all health checks and reports status
- [x] Exit code: 0 if all pass, 1 if any fail
- [x] Provides remediation hints (e.g., "Run: rm .env")
- [x] Can be run standalone before any change

**Agent-Executed QA:**
```
Scenario: Validation catches issues
Tool: Bash
Steps:
1. Create .env file in test directory
2. Run: ~/.opencode-dr/validate.sh
3. Assert outputs "FAIL: check_env_files.py - .env detected in CWD"
4. Assert exit code 1
5. Remove .env file
6. Run validate again
7. Assert all checks PASS
Expected Result: Validation catches ThreadLock trigger
Evidence: Script output, exit codes
```

**Commit:** YES
- Message: `feat(dr): add pre-flight validation script`
- Files: `.opencode-dr/validate.sh`

---

### Task 6: Implement Recovery CLI

**What to do:**
- Create `~/.opencode-dr/recover.sh` script
- Interactive menu with options:
  - [1] List available backups
  - [2] Restore from backup (select which)
  - [3] Reset to emergency minimal
  - [4] Reset to stable baseline (last known good)
  - [5] Quarantine current config for analysis
  - [6] Run diagnostics
- Safely quarantine broken config before restore
- Verify restoration works (quick smoke test)

**Must NOT do:**
- Don't auto-restore (require explicit user choice)
- Don't delete quarantined configs (keep for debugging)
- Don't restore without creating recovery point first

**Recommended Agent Profile:**
- **Category:** quick
- **Skills:** []
- **Reason:** Interactive Bash script with menus

**Parallelization:**
- **Can Run In Parallel:** NO (depends on Task 1)
- **Parallel Group:** Wave 2
- **Blocks:** Task 7
- **Blocked By:** Task 1

**References:**
- `~/.opencode-dr/backups/` - Backup directory from Task 4
- `~/.opencode-dr/emergency-config/` - Minimal config from Task 2
- Claude Code session: Recovery workflow that worked

**Acceptance Criteria:**
- [x] File: `~/.opencode-dr/recover.sh` (executable)
- [x] Menu system with numbered options
- [x] Option 1: Lists backups with timestamps
- [x] Option 2: Restore with confirmation prompt
- [x] Option 3: Emergency minimal mode
- [x] Option 4: Reset to stable (last working state)
- [x] Option 5: Quarantine current (moves to quarantine/)
- [x] Option 6: Run full diagnostics
- [x] All operations logged to `~/.opencode-dr/logs/recovery-YYYY-MM-DD.log`

**Agent-Executed QA:**
```
Scenario: Recovery workflow
Tool: Bash
Steps:
1. Create backup: ~/.opencode-dr/backup.sh "baseline"
2. Simulate corruption: echo "garbage" > ~/.config/opencode/opencode.json
3. Run: ~/.opencode-dr/recover.sh
4. Select option 2 (restore from backup)
5. Select the "baseline" backup
6. Confirm restoration
7. Assert quarantine/ directory contains old config
8. Assert opencode --version works
Expected Result: Full recovery from corruption
Evidence: Recovery log, opencode startup test
```

**Commit:** YES
- Message: `feat(dr): implement interactive recovery CLI`
- Files: `.opencode-dr/recover.sh`

---

### Task 7: Integration and Testing

**What to do:**
- Create integration test suite
- Test complete backup → corrupt → restore cycle
- Test all recovery menu options
- Verify all success criteria met after recovery
- Document usage in README

**Must NOT do:**
- Don't test on production config (use test directories)
- Don't skip any recovery path

**Recommended Agent Profile:**
- **Category:** quick
- **Skills:** []
- **Reason:** Integration testing and documentation

**Parallelization:**
- **Can Run In Parallel:** NO (depends on Tasks 1-6)
- **Parallel Group:** Wave 3
- **Blocks:** None (final task)
- **Blocked By:** Tasks 1, 2, 3, 4, 5, 6

**References:**
- All previous tasks
- `~/.config/opencode/` - Production config (for final validation)

**Acceptance Criteria:**
- [x] File: `~/.opencode-dr/test-recovery.sh` (integration tests)
- [x] Test passes: Backup creation
- [x] Test passes: Validation catches .env
- [x] Test passes: Validation catches corrupt JSON
- [x] Test passes: Recovery restores working state
- [x] Test passes: Emergency minimal mode works
- [x] Test passes: All 7 plugins load after recovery
- [x] Test passes: All 8 agents available after recovery
- [x] File: `~/.opencode-dr/README.md` updated with usage

**Agent-Executed QA:**
```
Scenario: Full disaster recovery test
Tool: Bash
Steps:
1. Create baseline backup
2. Verify all plugins load
3. Simulate corruption (add garbage to config)
4. Run recovery
5. Restore from baseline backup
6. Verify opencode starts
7. Verify plugins load: grep "plugin" ~/.local/share/opencode/log/latest.log
8. Verify agents available: check oh-my-opencode agents in config
Expected Result: Complete recovery, all functionality intact
Evidence: Test output, recovery logs, manual opencode verification
```

**Commit:** YES
- Message: `feat(dr): add integration tests and documentation`
- Files: `.opencode-dr/test-recovery.sh`, `.opencode-dr/README.md`

---

## Success Criteria

### Verification Commands

**Quick Health Check:**
```bash
# Verify DR system installed
ls -la ~/.opencode-dr/

# Test validation
~/.opencode-dr/validate.sh

# Create test backup
~/.opencode-dr/backup.sh "test-$(date +%s)"

# Verify recovery works
cd /tmp && ~/.opencode-dr/recover.sh --dry-run
```

### Final Checklist

- [x] **Task 1:** Directory structure exists with all subdirectories
- [x] **Task 2:** Emergency config can start opencode in isolation
- [x] **Task 3:** All health checks run and detect their target issues
- [x] **Task 4:** Backup script creates timestamped backups with rotation
- [x] **Task 5:** Validation script catches issues before they cause crashes
- [x] **Task 6:** Recovery CLI can restore from any backup
- [x] **Task 7:** Integration tests pass for complete backup/restore cycle
- [x] **Final Test:** opencode starts after recovery, all plugins load, all agents available

### Evidence Paths

- Backup logs: `~/.opencode-dr/logs/backup-*.log`
- Recovery logs: `~/.opencode-dr/logs/recovery-*.log`
- Test results: `~/.opencode-dr/logs/test-*.log`
- Quarantine: `~/.opencode-dr/quarantine/`

---

## Notes for Executor

### Key Design Decisions

1. **Python for checks, Bash for orchestration**
   - Python: Cross-platform, robust JSON/SQLite handling
   - Bash: Better for file operations, process management

2. **External tools only**
   - No opencode/Bun dependencies for recovery
   - Works even when opencode is completely broken

3. **7-backup rotation**
   - Balances storage vs. history
   - User can adjust by modifying BACKUP_COUNT in backup.sh

4. **Emergency minimal config**
   - Stripped to essentials (Google provider only)
   - Guarantees startup even with plugin corruption

5. **Manual recovery**
   - User must explicitly choose recovery option
   - Prevents accidental rollbacks

### Storage Estimates

| Component | Size | Notes |
|-----------|------|-------|
| Base config | ~50KB | JSON files only |
| node_modules | ~500MB | Plugins + dependencies |
| DB | ~2.15GB | Your current size |
| Compressed | ~700MB | With zstd |
| 7 backups | ~4.9GB | 7 × 700MB |
| Scripts | ~50KB | Python + Bash |
| **Total** | **~5GB** | Conservative estimate |

### Compression Recommendation

```bash
# Add to backup.sh for automatic compression
if command -v zstd &> /dev/null; then
    tar --zstd -cf backup.tar.zst config/ node_modules/ db/
else
    tar -czf backup.tar.gz config/ node_modules/ db/
fi
```

This reduces 7-backup set from ~15GB to ~5GB.

### Integration with opencode-setup

After DR system is complete, consider:
1. Add `pre-commit` hook to auto-backup before git commits
2. Add `package.json` script: `"dr:backup": "~/.opencode-dr/backup.sh"`
3. Document in opencode-setup README

---

## Plan Summary

**Total Tasks:** 7
**Estimated Time:** 2-3 hours
**Storage Required:** ~5GB (7 compressed backups)
**Critical Path:** Task 1 → Task 4 → Task 7

**Success Definition:**
User can run `~/.opencode-dr/recover.sh` after any corruption, select a backup, and have fully working opencode with all 7 plugins, 8 agents, and intact learning data.

**Risk Mitigation:**
- External-only tools (no Bun/opencode dependency)
- Atomic backups (rsync + atomic move)
- Quarantine instead of delete
- Emergency minimal mode as last resort
