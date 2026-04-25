# SkillRL Cold-Start Policy

## Overview

This document defines the policy for SkillRL cold-start behavior, ensuring fresh installs have useful, honest starter learning state.

## Seed Philosophy

**Approach:** Curated starter seed with explicit provenance metadata

**Rationale:**
- Static seed provides consistent, tested baseline
- Generated seed from telemetry risks exposing user data
- Empty-but-valid schema provides no guidance

## Data Fidelity Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `seeded` | Initial curated data | Fresh installs, first run |
| `live` | Learned from actual usage | Normal operation |
| `degraded` | Fallback when learning unavailable | Error recovery |
| `demo` | Synthetic demonstration data | Documentation/examples |
| `unavailable` | No data available | System error |

## Cold-Start Initialization

### First Run Behavior

1. Check for existing `~/.opencode/skill-rl.json`
2. If not found:
   - Copy `opencode-config/skill-rl-seed.json` to `~/.opencode/skill-rl.json`
   - Add metadata:
     ```json
     {
       "seeded_at": "2026-04-24T21:00:00.000Z",
       "seed_source": "opencode-config/skill-rl-seed.json",
       "data_fidelity": "seeded"
     }
     ```
3. Load seeded state into SkillBank and EvolutionEngine

### API Behavior

**`/api/skills`:**
- Returns seeded skills with `data_fidelity: "seeded"`
- Includes provenance metadata
- Falls back to `unavailable` only if seed is missing/corrupt

**`/api/rl`:**
- Returns evolution state with `data_fidelity: "seeded"`
- Includes upgrade path guidance
- Falls back to `demo` only if seed unavailable

## Honesty Rules

### Seeded Data Must:
1. Be explicitly marked with `data_fidelity: "seeded"`
2. Include `seeded_at` timestamp
3. Include `seed_source` path
4. Have realistic initial values (not inflated)
5. Be clearly documented as starter data

### Seeded Data Must NOT:
1. Be misrepresented as learned-from-user behavior
2. Have artificially high success rates
3. Claim to reflect actual usage
4. Hide the seed origin

## Upgrade Path

As live learning accumulates:

1. **Week 1:** Seeded data dominates
2. **Week 2-4:** Live data begins replacing seeded values
3. **Month 2+:** Seeded data only for rarely-used skills
4. **Month 6+:** Seeded data archived, live data primary

The `data_fidelity` field transitions:
- `seeded` → `live` as real data accumulates
- Individual skills upgrade independently

## Cross-Process Safety

Seed initialization respects existing file locks:
1. Acquire lock on `~/.opencode/skill-rl.json.lock`
2. Check if file already exists (another process may have seeded)
3. If not exists, copy seed file
4. Release lock

## Testing

Run cold-start tests:
```bash
# Remove existing state
rm ~/.opencode/skill-rl.json

# Run test - should create seeded state
bun test packages/opencode-skill-rl-manager/test/fresh-state-seed.test.js

# Verify APIs report seeded fidelity
bun test integration-tests/skillrl-api-regression.test.js
```

## Policy Version

This policy is versioned. Changes require:
1. Update to this document
2. Seed file version bump
3. Migration path for existing installs

Current version: 1.0.0
