# Remote Sync & Integration Verification Checklist

**Goal**: Verify that all remote changes are pulled, integrated, and system is healthy.

---

## 1. Git Status ✓

- [ ] `git status` shows clean working tree (no dirty files)
- [ ] `git log HEAD..origin/master` shows 0 commits (synced)
- [ ] `git log origin/master..HEAD` shows expected local commits (skill enhancements, merges)
- [ ] Latest commit is recent (within last hour)
- [ ] No merge conflicts in working tree

**Command**:
```bash
git status --short
git log --oneline -3 origin/master
git log --oneline HEAD..origin/master
```

---

## 2. Governance & Learning Gate ✓

- [ ] `node scripts/learning-gate.mjs --verify-hashes` passes (no hash mismatches)
- [ ] `.governance-hashes.json` is in sync with remote version
- [ ] All governed config files match their hashes
- [ ] No pre-commit hook warnings for missing timestamps

**Command**:
```bash
node scripts/learning-gate.mjs --verify-hashes
```

---

## 3. Config Coherence ✓

- [ ] `node scripts/validate-config-coherence.mjs` returns 0 (no drift)
- [ ] `opencode-config/opencode.json` matches runtime `~/.config/opencode/opencode.json` (except enriched paths)
- [ ] No stale agent definitions in `opencode-config/agents/` (should be empty or minimal)
- [ ] Central config schema is valid (`opencode-config/central-config.json`)

**Command**:
```bash
node scripts/validate-config-coherence.mjs
bun run verify
```

---

## 4. Package Integrity ✓

- [ ] `bun install` succeeds (all dependencies resolvable)
- [ ] All 32+ packages have valid `package.json` files
- [ ] No circular dependencies in workspace
- [ ] `bun.lock` is up to date with remote version
- [ ] No missing dependencies declared (`packages/*/package.json` list all imports)

**Command**:
```bash
bun install --check
bun list | head -50
```

---

## 5. System Health Check ✓

- [ ] `bun run health` returns: "Health check complete: 0 fail"
- [ ] All enabled MCPs respond (supermemory, context7, playwright, websearch, grep, distill, sequentialthinking)
- [ ] Model connectivity test passes (at least one model available)
- [ ] No Bun version warnings (should match `.bun-version`)

**Command**:
```bash
bun run health
```

---

## 6. MCP Status ✓

- [ ] `bun run scripts/mcp-smoke-harness.mjs` shows all MCPs as "Live"
- [ ] Remote MCPs (supermemory, context7) report healthy
- [ ] Local MCPs resolve correctly (npx/uvx paths exist)
- [ ] MCP config (`mcp-servers/opencode-mcp-config.json`) is valid JSON

**Command**:
```bash
bun run scripts/mcp-smoke-harness.mjs 2>&1 | head -30
```

---

## 7. Test Suite ✓

- [ ] `bun test` runs without hanging (timeout 120s)
- [ ] Integration tests pass (or only pre-existing failures)
- [ ] No new test failures introduced by remote merge
- [ ] Critical plugin contracts validated

**Command**:
```bash
timeout 120 bun test 2>&1 | tail -20
```

---

## 8. Learning Engine & RL Pipeline ✓

- [ ] `packages/opencode-learning-engine/` tests pass
- [ ] SkillRL manager initializes correctly
- [ ] Meta-knowledge-index is populated (not empty)
- [ ] Model router loads successfully

**Command**:
```bash
bun test packages/opencode-learning-engine/
bun test packages/opencode-skill-rl-manager/
```

---

## 9. Dashboard & API Routes ✓

- [ ] Dashboard package has no build errors
- [ ] API routes are type-correct (Next.js)
- [ ] Auth middleware is applied to write endpoints
- [ ] Rate limiting is configured

**Command**:
```bash
cd packages/opencode-dashboard && npx next lint
```

---

## 10. Skill Registry & Definitions ✓

- [ ] All 20+ skill `SKILL.md` files are valid
- [ ] `opencode-config/skills/registry.json` is valid JSON
- [ ] No duplicate skill IDs in registry
- [ ] Skill files contain required YAML frontmatter

**Command**:
```bash
jq . opencode-config/skills/registry.json > /dev/null && echo "Valid JSON"
ls opencode-config/skills/*/SKILL.md | wc -l
```

---

## 11. Documentation Freshness ✓

- [ ] README.md reflects current setup
- [ ] AGENTS.md is current (check OVERVIEW section)
- [ ] Architecture docs exist for recent waves
- [ ] No obvious TODOs or outdated version numbers in docs

**Command**:
```bash
grep -i "version\|2026-03" README.md AGENTS.md | head -5
```

---

## 12. Critical Packages Verification ✓

Check that recent wave additions are present:

- [ ] `packages/opencode-codebase-memory/` exists (Wave 16)
- [ ] `packages/opencode-context-governor/src/mcp-server.mjs` exists (wrapper)
- [ ] `packages/opencode-memory-graph/src/mcp-server.mjs` exists (wrapper)
- [ ] `packages/opencode-runbooks/src/mcp-server.mjs` exists (wrapper)
- [ ] `opencode-config/skills/adaptive-journey-driven-swarm/SKILL.md` exists (new skill)

**Command**:
```bash
ls -la packages/opencode-codebase-memory/package.json
ls -la opencode-config/skills/adaptive-journey-driven-swarm/SKILL.md
```

---

## 13. Skill Enhancements Verification ✓

- [ ] `opencode-config/skills/codebase-auditor/SKILL.md` is v2.0
- [ ] `opencode-config/skills/innovation-migration-planner/SKILL.md` is v2.0
- [ ] Both skills have yin-yang integration documented
- [ ] `.sisyphus/notepads/skill-enhancements-2026-03-17.md` exists

**Command**:
```bash
grep "version: 2.0" opencode-config/skills/codebase-auditor/SKILL.md
grep "yin.*yang\|yang.*yin" opencode-config/skills/innovation-migration-planner/SKILL.md
```

---

## 14. Build & Compilation ✓

- [ ] `bun run build` succeeds (dashboard Next.js build)
- [ ] No TypeScript errors in dashboard
- [ ] No ESLint warnings in critical packages

**Command**:
```bash
bun run build 2>&1 | tail -10
```

---

## 15. Final Sync Check ✓

- [ ] No unstaged changes: `git status --short` is empty
- [ ] No commits ahead of origin: `git log origin/master..HEAD | wc -l` is 0 (or expected local commits only)
- [ ] All commits are signed/verified where required
- [ ] No uncommitted work in `.sisyphus/` or config

**Command**:
```bash
git status --short
git log --oneline -1 origin/master
```

---

## Quick Verification Script

```bash
#!/bin/bash
set -e

echo "=== GIT STATUS ==="
git status --short && echo "✓ Clean tree" || exit 1

echo "=== GOVERNANCE HASHES ==="
node scripts/learning-gate.mjs --verify-hashes && echo "✓ Hashes OK" || exit 1

echo "=== HEALTH CHECK ==="
bun run health 2>&1 | grep "Health check complete: 0 fail" && echo "✓ Health OK" || exit 1

echo "=== PACKAGE VERIFY ==="
bun install --check && echo "✓ Packages OK" || exit 1

echo "=== CRITICAL SKILLS ==="
test -f opencode-config/skills/adaptive-journey-driven-swarm/SKILL.md && echo "✓ New skills OK" || exit 1

echo ""
echo "====== ALL CHECKS PASSED ======"
```

---

## When to Run This Checklist

✅ **Always run after**:
- Pulling from remote (`git pull origin master`)
- Merging large feature branches
- After system updates or dependency upgrades
- Before committing major changes

✅ **Run daily/weekly as**:
- Pre-deployment sanity check
- Nightly CI/CD gate
- Before rolling out to production

---

## Troubleshooting Common Failures

| Failure | Root Cause | Fix |
|---------|-----------|-----|
| Learning gate hash mismatch | Config files drift from git | Run `node scripts/learning-gate.mjs --generate-hashes` |
| MCP health failure | Remote endpoint unavailable | Check API key, network connectivity |
| Test failures | Pre-existing issues in merge | Run `bun test` with filter to isolate new failures |
| Build failure | TypeScript errors in dashboard | Run `cd packages/opencode-dashboard && npx next lint` |
| Health check fails | Missing env vars | Verify `.env` file, check `~/.config/opencode/opencode.json` |

---

Generated: 2026-03-17T23:50:00Z
Status: Ready for use
