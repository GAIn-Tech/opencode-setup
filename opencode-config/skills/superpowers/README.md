# Superpowers Skills

This directory contains skills consolidated from the [superpowers](https://github.com/omc-superpowers/superpowers) project.

## Skills Included

| Skill | Description |
|-------|-------------|
| brainstorming | Pre-implementation ideation and exploration |
| dispatching-parallel-agents | Multi-agent parallel execution |
| executing-plans | Plan execution with checkpoints |
| finishing-a-development-branch | Branch completion workflow |
| receiving-code-review | Code review response handling |
| requesting-code-review | Code review request workflow |
| subagent-driven-development | Implementer/reviewer/spec prompts |
| systematic-debugging | Root cause analysis with defense-in-depth |
| test-driven-development | TDD workflow with anti-patterns guide |
| using-git-worktrees | Isolated worktree management |
| using-superpowers | Meta-skill for skill discovery/usage |
| verification-before-completion | Pre-completion verification gates |
| writing-plans | Plan document creation |
| writing-skills | Skill authoring with testing/persuasion principles |

## Usage

These skills are automatically available via `load_skills` in task() calls:

```javascript
task(
  category="quick",
  load_skills=["systematic-debugging", "test-driven-development"],
  prompt="..."
)
```

## Source

Consolidated from `~/.config/opencode/superpowers/skills/` via `scripts/consolidate-skills.mjs`.
