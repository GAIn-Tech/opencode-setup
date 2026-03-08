# opencode-skill-rl-manager

Hierarchical skill orchestration using SkillRL principles (arXiv:2602.08234). Manages skill selection, evolution, and learning from task outcomes.

## Features

- **Skill Bank**: Hierarchical storage with General and Task-Specific tiers
- **Evolution Engine**: Recursive learning from task failures
- **Context-Aware Selection**: Pick optimal skills based on task context
- **Cross-Process Safety**: File-based locks to prevent concurrent write corruption

## Usage

```javascript
const { SkillRLManager } = require('opencode-skill-rl-manager');

const manager = new SkillRLManager();
await manager.initialize();

// Select skills for a task
const skills = manager.selectSkills({
  task_type: 'debug',
  complexity: 'high',
  files: ['src/api/handler.ts'],
});

// Record outcome for learning
await manager.recordOutcome({
  skills: ['systematic-debugging'],
  success: true,
  tokens_used: 5000,
});
```

## API

### `SkillRLManager`

| Method | Description |
|--------|-------------|
| `initialize()` | Load skill bank and evolution state |
| `selectSkills(context)` | Select optimal skills for task context |
| `recordOutcome(result)` | Record task outcome for evolution |
| `getSkillBank()` | Get current skill hierarchy |
| `getEvolutionState()` | Get evolution engine state |

### `SkillBank`

Hierarchical skill storage with General (cross-task) and Task-Specific tiers.

### `EvolutionEngine`

Recursive learning engine that promotes/demotes skills based on outcome patterns.

## License

MIT
