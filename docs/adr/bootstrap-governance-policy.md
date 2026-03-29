# ADR: Bootstrap Governance Policy

## Status
Accepted

## Context
The Clone/Pull Zero-Touch Bootstrap plan establishes a secure, near-zero-setup onboarding flow. This ADR documents the governance policy, claim boundaries, and escalation paths for the bootstrap contract.

## Claim Boundaries

### What "Minimal Explicit Setup" Means
- **One command** (`bun run setup`) after clone reaches ready state
- **One command** (`bun run sync`) after pull reconciles drift
- **<= 10 minutes** fresh clone to ready state on supported targets
- **Core + official plugins** are guaranteed to be present and loadable

### What is NOT Guaranteed
- **Fully automatic clone/pull execution** - No hidden auto-execution on clone/pull
- **External integrations** - Third-party services/credentials require manual setup
- **Non-standard environments** - Air-gapped or heavily restricted environments may require additional steps
- **Universal portability** - Only bounded support matrix (Windows/macOS/Linux current+previous stable, x64/arm64)

## Opt-In Hook Policy

### Allowed
- Explicit hook install command: `bun run hooks:install`
- Developer-initiated hook activation
- Documented hook behavior in CONTRIBUTING.md

### Prohibited
- Hidden auto-install on clone/pull
- Implicit hook activation in setup flow
- Lifecycle scripts that install hooks without explicit user action

### Verification
- `scripts/verify-no-hidden-exec.mjs` enforces this policy
- CI check fails on hidden activation paths

## Conflict Behavior

### User-Local vs Generated Files
- **Generated files** (e.g., `tool-manifest.json`, `opencode.json`): Safe to regenerate, sync will overwrite
- **User-local files** (e.g., `.env.local`, custom configs): Protected, sync will block on conflicts
- **Config drift**: Detected and reported, but user-local changes take precedence

### Resolution
- Sync reports `reconciled` (generated files updated) and `blocked` (user-local conflicts)
- Developer must manually resolve protected conflicts

## Owner/Escalation Path

### Bootstrap Contract Owner
- **Primary**: Platform Engineering Team
- **Contact**: platform-engineering@example.com
- **Escalation**: CTO Office

### Failure Actions
- **Setup failure**: Block developer onboarding, escalate to Platform Engineering
- **Sync failure**: Block PR merge, require manual resolution
- **Policy violation**: Block CI, escalate to Security Team
- **SLO breach**: Alert Platform Engineering, review infrastructure

### Review Cadence
- **Monthly**: Review bootstrap success rates and SLO compliance
- **Quarterly**: Review policy effectiveness and update as needed
- **Annually**: Full governance review and ADR refresh

## Verification Commands
```bash
# Verify manifest
bun run verify-manifest

# Verify no hidden execution
bun run policy:no-hidden-exec

# Verify prerequisites
bun run verify-prereqs

# Verify plugin readiness
bun run verify-plugins

# Full bootstrap verification
bun run setup --report-json
bun run verify-setup --format json
```

## References
- [Clone/Pull Zero-Touch Bootstrap Plan](../../.sisyphus/plans/clone-pull-zero-touch-bootstrap.md)
- [Bootstrap Manifest](../../scripts/bootstrap-manifest.json)
- [No Hidden Execution Policy](../../scripts/verify-no-hidden-exec.mjs)
