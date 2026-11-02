# init-kb

Knowledge Base initialization command.

## Description

Initializes the OpenCode Knowledge Base at .sisyphus/kb/. Creates meta-knowledge.json, audit-templates.json, project-states.json, and learning-sync.json if they don't exist.

## Usage

- Run `bun run init-kb` to initialize `.sisyphus/kb` if missing.
- Run `bun run init-kb --check` to validate whether initialization is required.
- Run `bun run init-kb --force` to rebuild KB templates.

## Examples

- `bun run init-kb`
- `bun run init-kb --check`
- `bun run init-kb --force --workspace /path/to/project`
## Skills

- (internal) KbInitializer class from opencode-init-kb package
- run scripts/init-kb.mjs to execute
