# Governance Gate Contract

## Overview

This document defines the contract for governance gates that protect the OpenCode configuration from unauthorized or accidental changes.

## Gates

### Learning Gate (`scripts/learning-gate.mjs`)

**Purpose:** Validates that changes to governed configuration files are intentional and tracked.

**When it runs:**
- Local: `bun run governance:check`
- CI: `.github/workflows/governance-gate.yml`
- PR: On every pull request affecting governed paths

**What it validates:**
1. Changed files in governed paths have matching hash entries
2. Learning update files follow schema requirements
3. No unauthorized config drift

**Failure modes:**
| Scenario | Error Message | Recovery Action |
|----------|---------------|-----------------|
| Hash mismatch | `governance hash mismatch detected` | Run `node scripts/learning-gate.mjs --generate-hashes` |
| Invalid base parameter | `base parameter contained invalid characters` | Use valid git reference (SHA, tag, or branch) |
| Missing policy file | File not found error | Ensure `opencode-config/learning-update-policy.json` exists |
| Schema violation | JSON validation error | Fix learning update file format |

**Exit codes:**
- `0`: All checks passed
- `1`: Hash mismatch or validation failure
- `2`: Configuration error (missing policy, etc.)

### Deployment State Gate (`scripts/deployment-state.mjs`)

**Purpose:** Manages environment promotion and version tracking.

**When it runs:**
- Local: `node scripts/deployment-state.mjs check-flow`
- CI: Part of deployment workflow
- Release: Before promotion to next environment

**What it validates:**
1. Environment promotion follows allowed flow (dev → staging → prod)
2. Version strings are valid semantic versions
3. Deployment history is recorded

**Failure modes:**
| Scenario | Error Message | Recovery Action |
|----------|---------------|-----------------|
| Invalid environment | `invalid environment 'X'` | Use one of: dev, staging, prod |
| Invalid promotion | Cannot promote directly from dev to prod | Use intermediate environment |
| Missing version | `set requires: <env> <version>` | Provide both environment and version |
| Corrupt state | JSON parse error | Restore from backup or reinitialize |

**Exit codes:**
- `0`: Command succeeded
- `1`: Validation or execution error

## CI vs Local Parity

Both gates produce identical behavior in CI and local environments:

| Aspect | Local | CI |
|--------|-------|-----|
| Hash verification | Same | Same |
| Base SHA resolution | `HEAD` or user-provided | `github.event.pull_request.base.sha` |
| Failure behavior | Exit with error | Fail workflow job |
| Recovery instructions | Printed to stderr | Available in job logs |

## Recovery Procedures

### Hash Mismatch Recovery

1. Verify changes are intentional:
   ```bash
   git diff opencode-config/
   ```

2. If changes are approved, regenerate hashes:
   ```bash
   node scripts/learning-gate.mjs --generate-hashes
   ```

3. Commit the updated `.governance-hashes.json`:
   ```bash
   git add opencode-config/.governance-hashes.json
   git commit -m "chore: update governance hashes"
   ```

### Deployment State Recovery

1. Check current state:
   ```bash
   node scripts/deployment-state.mjs show
   ```

2. If state is corrupt, reinitialize:
   ```bash
   rm opencode-config/deployment-state.json
   node scripts/deployment-state.mjs set dev 0.0.0
   ```

3. For rollback:
   ```bash
   node scripts/deployment-state.mjs rollback <env> <version>
   ```

## Testing

Run governance tests:
```bash
bun test scripts/tests/learning-gate.test.mjs
bun test scripts/tests/deployment-state.test.mjs
```

## Contract Version

This contract is versioned. Changes to validation logic or exit codes require:
1. Update to this document
2. Version bump in policy file
3. Communication to all teams

Current version: 1.0.0
