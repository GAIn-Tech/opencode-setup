# OpenCode Disaster Recovery System

## Overview

The OpenCode Disaster Recovery (DR) system provides automated backup, validation, and recovery mechanisms for the OpenCode monorepo. It protects against common failure modes including ThreadLock deadlocks, database corruption, out-of-memory crashes, and state machine inconsistencies.

The DR system is designed to be installed to `~/.opencode-dr/` on user systems, with source code stored in this repository directory.

## Quick Start

1. **Pre-flight validation**: Run `validate.sh` to check system health
2. **Create backup**: Run `backup.sh` to snapshot current state
3. **Recover from corruption**: Run `recover.sh` to restore from backup
4. **Emergency recovery**: Run `recover.sh --minimal` for minimal state recovery

## Available Commands

### validate.sh
Pre-flight health checks before backup or recovery operations.

- Checks disk space (minimum 500MB required)
- Verifies Bun installation and version
- Validates database integrity (audit.db, learning.db)
- Checks for known crash patterns in logs
- Verifies git repository state

Exit code 0 = healthy, non-zero = issues detected

### backup.sh
Creates timestamped backup snapshots of critical state.

- Backs up: packages/opencode-model-manager/audit.db, learning.db, .sisyphus/ workflow state
- Stores in: backups/YYYY-MM-DD_HH-MM-SS/
- Compresses with gzip for storage efficiency
- Creates manifest.json with file checksums
- Retains last 10 backups automatically

### recover.sh
Interactive recovery from backup snapshots.

- Lists available backups with timestamps and sizes
- Validates backup integrity before restore
- Restores selected backup to original locations
- Verifies restored files match backup checksums
- Supports `--minimal` flag for emergency recovery (state only, no databases)

### health-checks/ (Python modules)
Modular health check system for targeted diagnostics.

- database-integrity.py: SQLite corruption detection
- thread-lock-detector.py: Identifies ThreadLock deadlock patterns
- memory-analyzer.py: Detects OOM crash signatures
- state-machine-validator.py: Validates sisyphus state consistency
- log-analyzer.py: Scans logs for known error patterns

## Directory Structure

```
.opencode-dr/
├── .gitignore              # Ignore large files and backups
├── README.md               # This file
├── backups/                # Timestamped backup snapshots
├── emergency-config/       # Minimal config for emergency recovery
├── health-checks/          # Python health check modules
├── logs/                   # Recovery operation logs
└── quarantine/             # Corrupted files isolated during recovery
```

### backups/
Contains timestamped backup directories created by `backup.sh`.

Each backup includes:
- audit.db.gz (compressed audit log database)
- learning.db.gz (compressed learning engine database)
- sisyphus-state.tar.gz (compressed workflow state)
- manifest.json (checksums and metadata)

### emergency-config/
Minimal configuration files for emergency recovery scenarios.

Used by `recover.sh --minimal` to restore basic functionality without full database recovery.

### health-checks/
Python modules for targeted system diagnostics.

Run individually: `python health-checks/database-integrity.py`
Or via validate.sh for comprehensive checks.

### logs/
Operation logs from backup and recovery runs.

Format: recovery-YYYY-MM-DD_HH-MM-SS.log
Includes timestamps, file operations, checksums, and error details.

### quarantine/
Corrupted or suspicious files isolated during recovery.

Files moved here during recovery operations for manual inspection.
Naming: original-filename.YYYY-MM-DD_HH-MM-SS.quarantine

## Recovery Workflow

### Standard Recovery (from corruption)

1. **Run validate.sh**
   - Confirms system health and identifies issues
   - Exit if critical problems detected

2. **Run backup.sh**
   - Creates fresh backup of current state
   - Useful even if recovering from old backup (preserves recent work)

3. **Run recover.sh**
   - Lists available backups
   - Select backup to restore
   - Validates backup integrity
   - Restores files to original locations
   - Verifies checksums match

4. **Verify recovery**
   - Check logs/ for operation details
   - Run validate.sh again to confirm health
   - Test affected functionality

### Emergency Recovery (minimal state)

Use when databases are severely corrupted and full recovery is not possible:

```bash
./recover.sh --minimal
```

This mode:
- Skips database recovery (audit.db, learning.db)
- Restores only .sisyphus/ workflow state
- Uses emergency-config/ for minimal configuration
- Allows system to restart with clean state
- Requires manual re-initialization of learning engine

### Quarantine Inspection

If files are moved to quarantine/ during recovery:

1. Check quarantine/ directory for isolated files
2. Review recovery logs in logs/ for details
3. Compare quarantined files with backup manifest
4. Manually restore if needed: `cp quarantine/file.quarantine original-location`

## Common Scenarios

### ThreadLock Deadlock
- Symptom: Process hangs indefinitely
- Recovery: `validate.sh` detects pattern, `recover.sh` restores clean state

### Database Corruption
- Symptom: SQLite errors, "database disk image malformed"
- Recovery: `validate.sh` detects via integrity check, `recover.sh` restores from backup

### Out-of-Memory Crash
- Symptom: Process killed, logs show "SIGKILL" or "OOM"
- Recovery: `validate.sh` checks disk space, `recover.sh` restores state

### State Machine Inconsistency
- Symptom: Sisyphus state invalid, workflow won't progress
- Recovery: `recover.sh --minimal` restores clean workflow state

## Backup Retention

- Automatic: Last 10 backups retained
- Manual cleanup: `rm -rf backups/YYYY-MM-DD_HH-MM-SS/`
- Storage: Each backup ~50-200MB depending on database size

## Logs and Diagnostics

All operations logged to logs/ with timestamps.

View recent operations:
```bash
tail -f logs/recovery-*.log
```

Search for errors:
```bash
grep -i error logs/recovery-*.log
```

## Installation

The DR system is installed to user home directory during setup:

```bash
cp -r .opencode-dr ~/.opencode-dr
```

Scripts are made executable:
```bash
chmod +x ~/.opencode-dr/*.sh
```

## Support

For issues with recovery:
1. Check logs/ for detailed error messages
2. Run validate.sh to diagnose system state
3. Review quarantine/ for isolated files
4. Consult AGENTS.md for anti-patterns and known issues
