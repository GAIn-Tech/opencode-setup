# Clone oh-my-opencode locally for modification

## Why local copy?
The oh-my-opencode orchestration code (task delegation) lives in the npm package, not in opencode-setup. To integrate Learning Engine, we need to modify the source.

## Options

### Option 1: Clone from npm registry source
```bash
# Find the package location in bun cache
bun pm ls -g | grep oh-my-opencode

# Or check npm
npm view oh-my-opencode repository
```

### Option 2: Clone from GitHub (if public)
```bash
# Check if there's a public repo
gh repo list GAIn-Tech
```

### Option 3: Use npm pack to get source
```bash
# Download the package source
npm pack oh-my-opencode
tar -xzf oh-my-opencode-*.tgz
```

---

## Next Steps

Once you have the source, you'll need to:
1. Find where tasks are delegated (the orchestration flow)
2. Add `integrationLayer.getLearningAdvice()` before task dispatch
3. Add `integrationLayer.learnFromOutcome()` after task completion
4. Show warnings when `should_pause === true`

The hooks we added in IntegrationLayer are ready to use.

---

**What would you like to do?**
1. Help me find the npm package location
2. Clone from a git repo (if you know the URL)
3. Download via npm pack