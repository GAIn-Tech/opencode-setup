# opencode-plugin-preload-skills

Contextual skill loading — only loads relevant skills per task instead of all skills at once.

- **npm**: `opencode-plugin-preload-skills@latest`
- **Purpose**: Reduces token waste by smartly selecting which skills to inject into agent context
- **Why**: Without this, every agent gets all 46 skills loaded regardless of task type
