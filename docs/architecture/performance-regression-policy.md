# Performance Regression Policy

## Overview

This document defines the policy for performance regression detection and baseline management in the OpenCode project.

## Baseline Management

### Capturing Baselines

Baselines should be captured:
- After significant performance optimizations
- Before major releases
- When CI environment changes (runner images, Bun version, etc.)
- When test hardware is upgraded

To capture a new baseline:
```bash
bun run scripts/perf-baseline.mjs --capture
```

To force overwrite an existing baseline:
```bash
bun run scripts/perf-baseline.mjs --capture --force
```

### Baseline Refresh Policy

**Who can refresh:**
- Maintainers with explicit approval
- CI bot (automated on main branch after successful perf run)

**Evidence required:**
- PR description must reference the performance improvement
- Before/after metrics must be documented
- Change must be intentional, not accidental

**When to refresh vs. investigate:**
- Refresh: Intentional optimization that improves metrics
- Investigate: Unexpected metric changes (potential regression)

## Regression Detection

### Thresholds

Each performance test has defined thresholds:

| Test | Relative Threshold | Absolute Threshold | Description |
|------|-------------------|---------------------|-------------|
| fg01-stats-durability | 1.25 | 100ms | Stats persistence overhead |
| fg02-hotpath-io | 1.25 | 100ms | Autosave I/O overhead |
| fg03-feedback-lag | 1.25 | 100ms | Feedback processing latency |
| fg06-tail-latency-slo | 1.25 | 100ms | Tail latency SLO compliance |
| fg08-poll-coordination | 1.25 | 100ms | Poll coordination overhead |

### CI Behavior

**On PR:**
- Performance regression check runs automatically
- Results posted as PR comment
- Failure blocks merge (if branch protection enabled)

**On main branch:**
- Performance check runs on every push
- Results stored as artifacts
- Baseline auto-refreshed on successful run (optional)

### Failure Classification

| Exit Code | Meaning | Action |
|-----------|---------|--------|
| 0 | All metrics pass | Proceed |
| 1 | Regression detected | Block merge, investigate |
| 2 | Warning (within tolerance) | Review, may proceed |

## Artifact Retention

Failed performance runs upload:
- Baseline file (`current.json`)
- Comparison results
- System information

Retention: 30 days

## Local Development

Developers can run performance checks locally:
```bash
# Check against stored baseline
bun run scripts/perf-baseline.mjs --check --verbose

# Capture new baseline (for intentional changes)
bun run scripts/perf-baseline.mjs --capture
```

## CI Integration

The performance regression workflow (`.github/workflows/perf-regression.yml`) runs:
- On PRs affecting performance-sensitive code
- On pushes to main
- With verbose output for debugging
- Uploads artifacts on failure

## Policy Version

This policy is versioned. Changes require:
1. Update to this document
2. Team notification
3. Baseline refresh if thresholds change

Current version: 1.0.0
