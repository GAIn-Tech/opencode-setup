# Skill Profiles

Profiles are reusable, multi-skill bundles for common workflows. All profiles are defined in `opencode-config/skills/registry.json` — this document is the human-readable mirror.

## Available Profiles

### `deep-refactoring`
- Skills: `test-driven-development`, `systematic-debugging`, `git-master`, `verification-before-completion`
- Use for: risky refactors, bug fixes requiring confidence, regression prevention.
- Triggers: "refactor", "clean up code", "improve architecture"

### `planning-cycle`
- Skills: `brainstorming`, `writing-plans`, `executing-plans`
- Use for: ambiguous requests, multi-step feature design before code changes.
- Triggers: "plan feature", "design system", "architect"

### `review-cycle`
- Skills: `requesting-code-review`, `receiving-code-review`, `verification-before-completion`
- Use for: quality assurance and merge readiness.
- Triggers: "code review", "PR review", "review cycle"

### `parallel-implementation`
- Skills: `dispatching-parallel-agents`, `subagent-driven-development`, `executing-plans`
- Use for: independent workstreams with low coupling.
- Triggers: "parallel work", "divide and conquer", "complex implementation"

### `browser-testing`
- Skills: `dev-browser`, `frontend-ui-ux`, `verification-before-completion`
- Use for: UI verification, browser automation, frontend polish.
- Triggers: "test UI", "browser test", "visual verification"

### `diagnostic-healing`
- Skills: `code-doctor`, `systematic-debugging`, `incident-commander`, `git-master`
- Use for: failing tests, regressions, repeated break/fix cycles, complex incidents.
- Triggers: "diagnose", "fix bug", "heal code", "auto-fix", "incident"

### `research-to-code`
- Skills: `research-builder`, `writing-plans`, `executing-plans`
- Use for: unfamiliar libraries, feature discovery, research-first implementation.
- Triggers: "research and build", "investigate then implement", "deep dive"

---

## When to Combine Profiles

Profiles compose cleanly in sequence — use the chains defined in `COMPOSITION.md`:

| Scenario | Chain |
|----------|-------|
| New feature end-to-end | `planning-cycle` → `research-to-code` → `review-cycle` |
| Bug investigation + fix | `diagnostic-healing` → `review-cycle` |
| Risky refactor | `deep-refactoring` → `review-cycle` |
| Parallel feature work | `planning-cycle` → `parallel-implementation` → `review-cycle` |

---

## Commands

```bash
node scripts/skill-profile-loader.mjs profile diagnostic-healing
node scripts/skill-profile-loader.mjs recommend "refactor and add tests" 3
node scripts/skill-profile-loader.mjs validate
node scripts/check-skill-consistency.mjs
```

---

## Troubleshooting

- **Profile load fails with unknown skill**
  - Run validator, then add missing skill metadata in `registry.json`.

- **Resolved order looks wrong**
  - Check dependencies for each skill; dependencies are loaded first.

- **No profile recommendation returned**
  - Add better trigger phrases in both profile and skill `triggers` arrays.

- **Profile docs out of sync with registry**
  - Run: `node scripts/skill-profile-loader.mjs profile <name>` and compare `resolvedSkills` to what's listed here.
  - The registry is always authoritative — update this file to match.
