# opencode-plugin-preload-skills

Dynamic skill and tool preloading with three-tier classification and RL-driven promotion. Loads only relevant skills per task context to reduce token overhead.

## Features

- **Three-Tier Classification**: Skills ranked as core, recommended, or optional
- **Context-Aware Loading**: Only loads skills relevant to the current task
- **RL-Driven Promotion**: Skills promoted or demoted based on usage outcomes
- **Token Optimization**: Reduces context window usage by filtering irrelevant skills

## Usage

```javascript
const { PreloadSkillsPlugin } = require('opencode-plugin-preload-skills');

const preloader = new PreloadSkillsPlugin({
  logLevel: 'info',
});

const selection = preloader.selectTools({
  prompt: 'What is the correct syntax for using the React useEffect API?',
  taskType: 'research',
});

console.log(selection.tools.map((tool) => tool.name));
// ['read', 'edit', 'write', ..., 'context7_resolve_library_id', 'context7_query_docs']
```

## API

| Method | Description |
|--------|-------------|
| `selectTools(context)` | Return `{ tools, tier2Available, meta_context, metadata }` for the current prompt/task |
| `loadOnDemand(skillName, taskType)` | Load a Tier 2 skill on demand |
| `recordUsage(toolName)` | Track selected tool usage for promotion/demotion analysis |
| `getStats()` | Return plugin stats and counters |

## Runtime Contract

- `selectTools()` returns the **selected tool surface**, not a finished runtime invocation.
- MCP-backed entries are expanded to **callable tool IDs** where the runtime exposes them (for example `context7_query_docs`, `distill_run_tool`).
- The plugin host/runtime must still consume `selection.tools` and pass those tool names into the actual model/tool surface.
- In this repo, `IntegrationLayer.selectToolsForTask()` is the contract boundary for injecting a `PreloadSkillsPlugin` instance, but the external plugin host remains responsible for applying the selected tool IDs at runtime.

## License

MIT
