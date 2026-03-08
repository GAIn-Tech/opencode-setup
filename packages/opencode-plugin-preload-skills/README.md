# opencode-plugin-preload-skills

Dynamic skill and tool preloading with three-tier classification and RL-driven promotion. Loads only relevant skills per task context to reduce token overhead.

## Features

- **Three-Tier Classification**: Skills ranked as core, recommended, or optional
- **Context-Aware Loading**: Only loads skills relevant to the current task
- **RL-Driven Promotion**: Skills promoted or demoted based on usage outcomes
- **Token Optimization**: Reduces context window usage by filtering irrelevant skills

## Usage

```javascript
const PreloadSkills = require('opencode-plugin-preload-skills');

const preloader = new PreloadSkills({
  skillsDir: '~/.config/opencode/skills',
});

const skills = preloader.getSkillsForContext({
  task_type: 'debug',
  files: ['src/api/handler.ts'],
});
```

## API

| Method | Description |
|--------|-------------|
| `getSkillsForContext(context)` | Get relevant skills for a task context |
| `promoteSkill(name)` | Promote a skill's tier based on positive outcome |
| `demoteSkill(name)` | Demote a skill's tier based on negative outcome |
| `getClassification()` | Get current skill tier assignments |

## License

MIT
