# Config Coherence Wave Plan

## Goal
Add audit logging, version tracking, and multi-machine detection to the config coherence system.

## Scope

### 1. Machine Identity (Foundation)
- Generate `~/.opencode/machine-id.json` on first access
- Schema: `{ id: crypto.randomUUID(), hostname: os.hostname(), platform: os.platform(), arch: os.arch(), created: ISO timestamp }`
- Function: `getMachineId()` — reads or creates the file
- Location: new helper in `scripts/validate-config-coherence.mjs`

### 2. Audit Logging
- NDJSON file at `~/.opencode/config-audit.ndjson`
- Each line: `{ timestamp, action: "coherence-check"|"sync", ok, machineId, driftCount, drift: [...], repoConfigDir, runtimeConfigDir }`
- Function: `appendAuditEntry(result, action)` — appends one NDJSON line
- Hook: Called from `runCli()` after every coherence check
- Max file size: rotate at 1MB (rename to .ndjson.1, start fresh)

### 3. Version Manifest
- File: `~/.opencode/config-manifest.json`
- Schema: `{ version: number, lastSync: ISO, machineId: string, files: { [name]: sha256 } }`
- Writer: `writeConfigManifest()` — called from `copy-config.mjs` after sync
- Reader: `readConfigManifest()` — called from validate-config-coherence.mjs
- Cross-machine warning: if manifest.machineId !== current machineId, emit warning

## Files Modified
1. `scripts/validate-config-coherence.mjs` — Add getMachineId(), appendAuditEntry(), readConfigManifest(), cross-machine warning
2. `scripts/copy-config.mjs` — Add writeConfigManifest() call after sync
3. `scripts/tests/validate-config-coherence.test.js` — Tests for audit, manifest, machine-id

## Implementation Notes
- All new file I/O uses sync fs (consistent with existing code in validate-config-coherence.mjs)
- Machine ID file location: `path.join(userConfigDir(), '.machine-id.json')` (dot-prefix = hidden)
- Audit log location: `path.join(userConfigDir(), 'config-audit.ndjson')`
- Manifest location: `path.join(userConfigDir(), 'config-manifest.json')`
- `userConfigDir()` from resolve-root.mjs
- NDJSON rotation: simple rename to .1, no compression
