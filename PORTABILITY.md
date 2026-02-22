# Portability Guide

This setup is designed for **maximum portability and robustness** across machines.

## Why This Approach?

Instead of publishing to npm (which requires authentication, 2FA, and ongoing maintenance), we use a **workspace + global linking** strategy that provides:

✅ **Zero npm dependencies** - No npm publishing required
✅ **One-command setup** - Clone repo and run `bun run setup`
✅ **No authentication needed** - Works offline
✅ **Version controlled** - All code in git
✅ **Easy updates** - Changes are immediately available (no republishing)
✅ **Cross-platform** - Works on Windows, macOS, Linux

## How It Works

### 1. Monorepo Workspace Structure

```
opencode-setup/
├── package.json           # Workspace root (manages all packages)
└── packages/
    ├── opencode-model-router-x/
    ├── opencode-plugin-healthd/
    └── ...                # All custom plugins
```

The root `package.json` declares all packages as a workspace, allowing Bun to manage them as a unit.

### 2. Global Linking

Each package is globally linked using `bun link`:

```bash
cd packages/opencode-model-router-x
bun link  # Creates symlink in ~/.bun/install/global/node_modules/@jackoatmon/
```

This makes packages available globally by their scoped names (`@jackoatmon/opencode-model-router-x`).

### 3. OpenCode Configuration

The `~/.config/opencode/opencode.json` references plugins by their scoped names:

```json
{
  "plugin": [
    "@jackoatmon/opencode-model-router-x@0.1.0",
    "@jackoatmon/opencode-plugin-healthd@0.1.0",
    ...
  ]
}
```

OpenCode resolves these through Bun's global link registry, finding the local packages.

## Setting Up on a New Machine

### Quick Setup (3 minutes)

```bash
# 1. Install prerequisites
# Install Bun 1.3.9, then install OpenCode CLI
npm install -g opencode

# 2. Clone repo
git clone <your-repo-url> opencode-setup
cd opencode-setup

# 3. Run setup script
bun run setup

# 4. Verify
bun run verify

# 5. Start OpenCode
opencode
```

### What the Setup Script Does

1. ✅ Installs workspace dependencies (`bun install`)
2. ✅ Links all custom plugins globally (`bun link`)
3. ✅ Copies configuration files to `~/.config/opencode/`
4. ✅ Creates backups of existing configs

## Updating Plugins

### On the Original Machine

```bash
cd opencode-setup/packages/opencode-model-router-x
# Make your changes to src/index.js
# Changes are immediately available (no rebuild needed)
opencode  # Test your changes
```

### Syncing to Other Machines

```bash
# Commit and push
git add .
git commit -m "Update model router logic"
git push

# On other machine
cd opencode-setup
git pull
# Changes are immediately available (plugins are symlinked)
```

## Comparison with npm Publishing

| Aspect | This Approach | npm Publishing |
|--------|---------------|----------------|
| Setup time on new machine | ~3 minutes | ~10 minutes |
| Requires npm account? | No | Yes |
| Requires 2FA codes? | No | Yes (for each publish) |
| Works offline? | Yes | No |
| Update propagation | Instant (git pull) | Manual republish + reinstall |
| Suitable for private code? | Yes | Requires paid npm |
| Versioning | Git tags | npm versions |

## When to Switch to npm Publishing

Consider publishing to npm when:

- You want to share plugins publicly with the OpenCode community
- You need semantic versioning guarantees
- You want plugins discoverable on npmjs.com
- You have many external users (not just your team)

To migrate later:

```bash
cd packages/opencode-model-router-x
npm publish --access public
# Repeat for each package
```

Then update `opencode.json` to use npm versions instead of links.

## Troubleshooting

### "Cannot find module @jackoatmon/opencode-model-router-x"

Re-run the linking:

```bash
cd opencode-setup/packages
for dir in opencode-*/; do
  cd "$dir" && bun link && cd ..
done
```

### Changes not appearing

Restart OpenCode:
```bash
# Kill existing session
pkill -f opencode

# Start fresh
opencode
```

### Want to uninstall

```bash
# Unlink all packages
cd opencode-setup/packages
for dir in opencode-*/; do
  cd "$dir" && bun unlink && cd ..
done

# Remove from config
vim ~/.config/opencode/opencode.json
# Delete the @jackoatmon/* entries

# Optionally delete the repo
rm -rf opencode-setup
```

## Best Practices

### For Development

1. **Make changes in the workspace** - Never edit files in `~/.bun/install/global/`
2. **Test locally first** - Verify changes work before pushing
3. **Use git branches** - Create feature branches for experimental changes
4. **Commit often** - Small commits make troubleshooting easier

### For Team Collaboration

1. **Document plugins** - Keep README.md files updated in each package
2. **Use conventional commits** - `feat:`, `fix:`, `docs:` prefixes
3. **Version bumps** - Update `package.json` version when making breaking changes
4. **Tag releases** - Use git tags for stable versions

### For Production Use

1. **Pin versions** - Use specific git commits or tags in production
2. **Test before merging** - Run verification script on staging
3. **Keep backups** - The setup script auto-backups configs
4. **Monitor changes** - Review plugin updates before pulling

## Architecture Benefits

This setup provides:

- **Atomic updates** - All plugins update together via git pull
- **Rollback capability** - `git checkout` to previous version
- **Development workflow** - Edit code, see changes immediately
- **No package registry** - Self-contained, no external dependencies
- **Reproducible** - Exact same code on all machines via git

## Future Migration Path

When ready to publish to npm:

1. Ensure all `package.json` files have correct metadata
2. Create npm automation token
3. Run: `npm run publish-all` (add this script to root package.json)
4. Update opencode.json to use npm versions
5. Remove global links

This approach gives you flexibility to start simple and scale up when needed.
