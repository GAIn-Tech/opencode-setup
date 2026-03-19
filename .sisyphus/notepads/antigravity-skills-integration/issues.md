# Issues — antigravity-skills-integration

## Known Gotchas
- ExplorationRLAdapter sends `skills: [array]` but learnFromOutcome() expects `skill_used: string` — field mismatch (Task 15)
- registry.json has `profiles` key, NOT `workflowProfiles` — use `r.profiles` in all code/scripts
- `selection.test.js` does NOT exist — Task 1 CREATES it (do not treat as pre-existing)
- `_seedGeneralSkills()` seeds 5 skills with hardcoded names that COLLIDE with registry imports — Task 2 fixes by merging metadata instead of skipping

## Bun on Windows
- Use `cmd /c` for any Windows-specific commands
- `bun test` is the test runner
