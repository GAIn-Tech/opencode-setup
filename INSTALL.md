# OpenCode Custom Plugins Installation Guide

This directory contains custom OpenCode plugins that extend OpenCode's functionality.

## Quick Setup (Any Machine)

### Prerequisites
- Node.js 18+ installed
- Bun installed (`npm install -g bun`)
- OpenCode installed (`npm install -g opencode-ai`)

### Installation Steps

1. **Clone this repository:**
   ```bash
   git clone <your-repo-url> opencode-setup
   cd opencode-setup
   ```

2. **Install and link all custom plugins:**
   ```bash
   bun install
   ```

3. **Link packages globally:**
   ```bash
   cd packages
   for dir in opencode-*/; do
     cd "$dir"
     bun link
     cd ..
   done
   cd ..
   ```

4. **Copy configuration files:**
   ```bash
   # Main OpenCode config
   cp opencode-config/opencode.json ~/.config/opencode/opencode.json

   # Other configs
   cp opencode-config/antigravity.json ~/.config/opencode/antigravity.json
   cp opencode-config/oh-my-opencode.json ~/.config/opencode/oh-my-opencode.json
   cp opencode-config/compound-engineering.json ~/.config/opencode/compound-engineering.json
   cp opencode-config/config.yaml ~/.opencode/config.yaml
   ```

5. **Verify installation:**
   ```bash
   opencode --version
   ```

## Custom Plugins Included

| Plugin | Version | Description |
|--------|---------|-------------|
| `@jackoatmon/opencode-model-router-x` | 0.1.0 | Policy-based model router with live outcome tuning |
| `@jackoatmon/opencode-plugin-healthd` | 0.1.0 | Health monitoring daemon for OpenCode |
| `@jackoatmon/opencode-eval-harness` | 0.1.0 | Evaluation and testing harness |
| `@jackoatmon/opencode-context-governor` | 0.1.0 | Context window management and optimization |
| `@jackoatmon/opencode-runbooks` | 0.1.0 | Automated runbooks for common tasks |
| `@jackoatmon/opencode-proofcheck` | 0.1.0 | Code verification and validation |
| `@jackoatmon/opencode-memory-graph` | 0.1.0 | Memory graph visualization and management |
| `@jackoatmon/opencode-fallback-doctor` | 0.1.0 | Fallback model management |

## How It Works

The custom plugins are:
1. Managed as a monorepo workspace using Bun
2. Globally linked using `bun link` so OpenCode can find them
3. Referenced in `~/.config/opencode/opencode.json` by their scoped names

## Updating Plugins

After making changes to any plugin:

```bash
cd opencode-setup/packages/<plugin-name>
# Make your changes
# No need to re-link, changes are live!
```

## Portability

This setup is designed for maximum portability:
- ✅ No npm publishing required
- ✅ Works on any machine with Node.js and Bun
- ✅ Just clone and run the setup script
- ✅ All dependencies managed locally
- ✅ Version controlled in git

## Troubleshooting

### OpenCode can't find custom plugins

Re-link the packages:
```bash
cd opencode-setup/packages
for dir in opencode-*/; do
  cd "$dir" && bun link && cd ..
done
```

### Want to publish to npm later?

If you decide to publish these packages to npm in the future:

1. Ensure you're logged in: `npm login`
2. Publish each package:
   ```bash
   cd packages/<plugin-name>
   npm publish --access public
   ```

## Development

### Adding a New Plugin

1. Create a new package directory:
   ```bash
   cd packages
   mkdir @jackoatmon/opencode-my-plugin
   cd @jackoatmon/opencode-my-plugin
   ```

2. Create `package.json`:
   ```json
   {
     "name": "@jackoatmon/opencode-my-plugin",
     "version": "0.1.0",
     "main": "src/index.js"
   }
   ```

3. Link it:
   ```bash
   bun link
   ```

4. Add to `~/.config/opencode/opencode.json`:
   ```json
   {
     "plugin": [
       ...
       "@jackoatmon/opencode-my-plugin@0.1.0"
     ]
   }
   ```
