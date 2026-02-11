# Project Configuration Template for OpenCode

## Rules

- Do what has been asked; nothing more, nothing less.
- NEVER create files unless absolutely necessary for the goal.
- ALWAYS prefer editing existing files over creating new ones.
- NEVER proactively create documentation files unless explicitly requested.
- Never save working files to the root folder — use appropriate subdirectories.

## File Organization

- `/src` — Source code
- `/tests` — Test files
- `/docs` — Documentation (only when requested)
- `/config` — Configuration files
- `/scripts` — Utility scripts

## Code Standards

- Modular design: files under 500 lines
- Never hardcode secrets — use environment variables
- Test-first: write tests before implementation
- Clean architecture: separate concerns

## Build & Test

```bash
# Customize these for your project
npm run build
npm run test
npm run lint
npm run typecheck
```

## Agent Delegation

Use `task()` for parallel agent execution:

```python
# Explore codebase patterns
task(subagent_type="explore", run_in_background=True,
     load_skills=[], description="Find patterns",
     prompt="Find all auth patterns in src/...")

# Implement with skills
task(category="unspecified-high", load_skills=["test-driven-development"],
     run_in_background=False, description="Implement feature",
     prompt="Implement user authentication with tests...")
```

## Git Conventions

- Commit format: `<type>: <subject>` (feat, fix, docs, refactor, test, chore, perf, security)
- Branch naming: `{type}/{short-description}`
- Always verify before committing: run tests, check diagnostics
