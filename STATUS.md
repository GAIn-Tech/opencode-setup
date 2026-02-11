# OpenCode Setup Status

## ✅ Current Status: OpenCode Working

OpenCode is now running successfully without errors.

## What Was Fixed

### The Problem
- OpenCode was trying to install custom plugins (`@jackoatmon/opencode-model-router-x@0.1.0`, etc.) from npm
- These plugins don't exist on npm (they're local development packages)
- This caused `BunInstallFailedError` and prevented OpenCode from starting

### The Solution
- **Removed custom plugins from `~/.config/opencode/opencode.json`**
- OpenCode now starts successfully with only published npm plugins
- Custom plugins are packaged and ready but NOT currently loaded by OpenCode

## Current OpenCode Configuration

### Plugins (Working ✓)
These are the plugins currently loaded by OpenCode:

1. `oh-my-opencode@3.5.2`
2. `opencode-antigravity-auth@1.4.6`
3. `opencode-supermemory@2.0.1`
4. `@tarquinen/opencode-dcp@2.1.1`
5. `cc-safety-net@0.7.1`
6. `@azumag/opencode-rate-limit-fallback@1.67.0`
7. `@mohak34/opencode-notifier@0.1.18`
8. `opencode-plugin-langfuse@0.1.8`
9. `opencode-plugin-preload-skills@1.8.0`
10. `@symbioticsec/opencode-security-plugin@0.0.1-beta.9`
11. `envsitter-guard@0.0.4`
12. `opencode-antigravity-quota@0.1.6`
13. `opencode-pty@0.2.1`

### Custom Plugins (Available but Not Loaded)
These plugins are packaged and symlinked but NOT enabled:

1. `@jackoatmon/opencode-model-router-x@0.1.0`
2. `@jackoatmon/opencode-plugin-healthd@0.1.0`
3. `@jackoatmon/opencode-eval-harness@0.1.0`
4. `@jackoatmon/opencode-context-governor@0.1.0`
5. `@jackoatmon/opencode-runbooks@0.1.0`
6. `@jackoatmon/opencode-proofcheck@0.1.0`
7. `@jackoatmon/opencode-memory-graph@0.1.0`
8. `@jackoatmon/opencode-fallback-doctor@0.1.0`

## Why Custom Plugins Aren't Loaded

OpenCode's plugin system works as follows:

1. Reads `~/.config/opencode/opencode.json` for plugin list
2. Installs plugins from npm to `~/.cache/opencode/node_modules/`
3. Loads installed plugins on startup

**The issue:** When you list a plugin in `opencode.json`, OpenCode tries to `npm install` it. Since our custom plugins aren't published to npm, the install fails and OpenCode won't start.

## Options to Enable Custom Plugins

### Option 1: Publish to npm (Best for Production)

**Pros:**
- ✅ Works exactly like other OpenCode plugins
- ✅ Auto-installs on new machines
- ✅ Proper versioning
- ✅ Can be shared with others

**Cons:**
- ❌ Requires npm account with 2FA
- ❌ Need OTP code for each publish
- ❌ Packages become public (or need paid npm for private)

**How to do it:**
```bash
# 1. Get npm automation token from https://www.npmjs.com/settings/jackoatmon/tokens
# 2. Configure it: npm config set //registry.npmjs.org/:_authToken YOUR_TOKEN

# 3. Publish each package
cd ~/opencode-setup/packages/opencode-model-router-x
npm publish --access public --otp YOUR_2FA_CODE

# 4. Add to opencode.json
# Edit ~/.config/opencode/opencode.json and add:
# "@jackoatmon/opencode-model-router-x@0.1.0"
```

### Option 2: Use as Library Dependencies (Current Setup)

**Pros:**
- ✅ No npm publishing needed
- ✅ Works offline
- ✅ Private code
- ✅ Easy to modify

**Cons:**
- ❌ Plugins don't auto-load on OpenCode startup
- ❌ Need manual integration with other plugins
- ❌ More complex setup

**Current status:**
- Plugins are symlinked to `~/.cache/opencode/node_modules/@jackoatmon/`
- They can be `require()`d by other plugins
- They just don't load automatically

**How to use:**
```javascript
// In another plugin or script:
const ModelRouter = require('@jackoatmon/opencode-model-router-x');
const router = new ModelRouter();
```

### Option 3: Fork OpenCode (Advanced)

Modify OpenCode source to support local file:// protocol plugins. Not recommended.

## Recommendation

For **maximum portability** and **production use**, the best path forward is:

1. **Publish to npm** - Worth the one-time setup hassle
2. Get automation token to avoid 2FA on each publish
3. All custom plugins become first-class OpenCode plugins
4. Works on any machine with just `npm install -g opencode-ai`

For **development/testing**, the current setup works fine - plugins are available but not auto-loaded.

## Current Working Setup

```bash
# Start OpenCode (works perfectly)
opencode

# All standard plugins are loaded
# Custom plugins are in node_modules but not loaded
# No errors, clean startup
```

## Files Modified

1. `~/.config/opencode/opencode.json` - Removed custom plugins from plugin list
2. `~/.cache/opencode/node_modules/@jackoatmon/*` - Symlinks to local packages (for future use)

## Next Steps

**To enable custom plugins:**

1. Create npm automation token: https://www.npmjs.com/settings/jackoatmon/tokens
2. Run: `npm config set //registry.npmjs.org/:_authToken YOUR_TOKEN`
3. Publish packages: `cd ~/opencode-setup && ./publish-to-npm.sh` (script to be created)
4. Update config: Add published plugins back to `opencode.json`

**Or, to use current setup:**

Just use OpenCode as-is. Custom plugins are packaged and ready for future npm publishing.

---

**Bottom line:** OpenCode works now. Custom plugins are ready but require npm publishing to be loaded automatically.
