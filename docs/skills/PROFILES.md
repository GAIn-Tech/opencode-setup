# Skill Profiles

Profiles are reusable, multi-skill bundles for common workflows.

## Available Profiles

### `deep-refactoring`
- Skills: `systematic-debugging`, `test-driven-development`, `git-master`
- Use for: risky refactors, bug fixes requiring confidence, regression prevention.

### `planning-cycle`
- Skills: `brainstorming`, `writing-plans`, `executing-plans`
- Use for: ambiguous requests, multi-step feature design before code changes.

### `review-cycle`
- Skills: `requesting-code-review`, `receiving-code-review`, `verification-before-completion`
- Use for: quality assurance and merge readiness.

### `parallel-implementation`
- Skills: `dispatching-parallel-agents`, `subagent-driven-development`
- Use for: independent workstreams with low coupling.

### `browser-testing`
- Skills: `dev-browser`, `frontend-ui-ux`
- Use for: UI verification, browser automation, frontend polish.

### `diagnostic-healing`
- Skills: `code-doctor`, `systematic-debugging`, `git-master`
- Use for: failing tests, regressions, repeated break/fix cycles.

### `research-to-code`
- Skills: `research-builder`, `writing-plans`, `executing-plans`
- Use for: unfamiliar libraries, feature discovery, research-first implementation.

## Commands

```bash
node scripts/skill-profile-loader.mjs profile diagnostic-healing
node scripts/skill-profile-loader.mjs recommend "refactor and add tests" 3
```

## Troubleshooting

- **Profile load fails with unknown skill**
  - Run validator, then add missing skill metadata in `registry.json`.

- **Resolved order looks wrong**
  - Check dependencies for each skill; dependencies are loaded first.

- **No profile recommendation returned**
  - Add better trigger phrases in both profile and skill `triggers` arrays.
