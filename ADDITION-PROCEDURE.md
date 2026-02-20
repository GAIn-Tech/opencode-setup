# Addition Procedure - Automated Component Integration

This document defines the **required procedure** for adding new packages, skills, plugins, MCP servers, and other components to the opencode-setup repository. Following this procedure ensures **complete integration** and prevents gaps like missing imports, untracked files, or incomplete documentation.

## Why This Exists

Previous gaps occurred because:
- New packages were created but not imported into orchestration
- New skills were added but not synced in setup.sh
- Documentation was updated but not enforced

This procedure **automates enforcement** to prevent future gaps.

---

## Quick Reference

| Component Type | Add To | Required Steps |
|---------------|--------|----------------|
| Package | `packages/` | 1-6 |
| Custom Skill | `opencode-config/skills/` | 1, 4-6 |
| Skill Profile | `opencode-config/skills/registry.json` | 1, 4-6 |
| Custom Command | `opencode-config/commands/` | 1, 4-6 |
| MCP Server | `mcp-servers/` | 1-6 |
| Plugin | `plugins/` | 1-6 |

---

## Step-by-Step Procedure

### Step 1: Create the Component

Create your package/skill in the appropriate location:

```bash
# Package
packages/opencode-new-package/src/index.js

# Skill  
opencode-config/skills/my-skill/SKILL.md

# Skill docs (if adding/modifying composition behavior)
docs/skills/OVERVIEW.md
docs/skills/PROFILES.md
docs/skills/CREATING-SKILLS.md
docs/skills/COMPOSITION.md

# Command
opencode-config/commands/my-command/

# MCP Server
mcp-servers/my-mcp/
```

### Step 2: Export from Package Index

Every package **MUST** export its public API from `src/index.js`:

```javascript
// REQUIRED: Export all public classes/functions
module.exports = {
  MyClass,
  helperFunction,
  CONSTANTS,
};

// OPTIONAL: Named exports for direct require
module.exports.MyClass = MyClass;
```

### Step 3: Import into Orchestration (Packages Only)

If adding a **new package** that should be used by the orchestration system, import it in the appropriate advisor or integration point:

```javascript
// In orchestration-advisor.js or relevant integration
const { MyClass } = require('opencode-new-package');
```

### Step 4: Add to Setup Sync

Add any new directories to `scripts/copy-config.mjs` `CONFIG_DIRS` array:

```javascript
const CONFIG_DIRS = [
  'learning-updates',
  'skills',
  'commands', 
  'agents',
  'docs',
  'models',
  'supermemory',
  // ADD NEW DIRECTORIES HERE
];
```

### Step 5: Document the Component

Update central documentation following the opencode-setup Documentation Style Guide (docs/documentation-style-guide.md):

- `README.md` - Add to feature list
- `INTEGRATION-GUIDE.md` - Document usage if applicable
- `TROUBLESHOOTING.md` - Add troubleshooting notes if needed
- All new documentation must use consistent heading levels, code block syntax highlighting, and visual hierarchy principles

### Step 6: Run Automated Verification

**MANDATORY** - Run the integration verification:

```bash
npm run verify
npm run verify:integration
node scripts/skill-profile-loader.mjs validate
```

This runs `scripts/verify-integration.mjs` which checks:
- All packages export from index.js
- All skills have SKILL.md (including nested skills like `superpowers/*`)
- Skill registry and schema files exist
- Skill profile/dependency validation passes
- All imports resolve
- Sync directories are configured

---

## Automation Scripts

### verify-integration.mjs

Automatically verifies all integration points:

```bash
npm run verify
# or
node scripts/verify-integration.mjs
```

**Checks:**
1. All packages have `src/index.js`
2. All package index.js export something
3. All skills have `SKILL.md`
4. All CONFIG_DIRS exist in opencode-config/
5. All required imports resolve

### Gate:integration

Automatically runs on push/PR:

```bash
npm run gate:integration
```

This is included in `governance:check`.

---

## CI Enforcement

All checks run automatically:

1. **Pre-push**: `npm run governance:check`
2. **PR**: CI runs `governance:check` 
3. **Verification**: `npm run verify`

If any step fails, the change is **blocked**.

---

## Checklist

Before submitting a PR, confirm:

- [ ] Package has `src/index.js` with exports
- [ ] New package imported in orchestration (if applicable)
- [ ] New directories added to `CONFIG_DIRS` in copy-config.mjs
- [ ] If adding a skill: `registry.json` updated with dependencies/synergies/conflicts/triggers
- [ ] If adding profile behavior: docs in `docs/skills/` updated
- [ ] Documentation updated
- [ ] `npm run verify` passes
- [ ] `npm run governance:check` passes

---

## Troubleshooting

### "Package not found" error
- Check package is in `packages/` directory
- Check package has `package.json`
- Run `npm run link-all`

### "Skill not synced" error
- Check skill is in `opencode-config/skills/`
- Check setup.sh copies the directory
- Run `npm run copy-config`

### "Import failed" error
- Check import path is correct
- Check package exports the symbol
- Run `npm run link-all`

---

## Related Documents

- `LIVING-DOCS.md` - Documentation governance
- `PORTABILITY.md` - Environment setup
- `INTEGRATION-GUIDE.md` - Integration patterns
- `opencode-config/docs-governance.json` - Doc enforcement rules
