# OpenCode Custom Plugins

This directory contains custom OpenCode plugins developed for extended functionality.

## Available Plugins

### 1. `@jackoatmon/opencode-model-router-x`
Policy-based model router with live outcome tuning for OpenCode.

**Features:**
- Dynamic model selection based on task complexity
- Live outcome tracking and optimization
- Policy-based routing rules

### 2. `@jackoatmon/opencode-plugin-healthd`
Health monitoring daemon for OpenCode.

**Features:**
- System health checks
- Performance monitoring
- Automated diagnostics

### 3. `@jackoatmon/opencode-eval-harness`
Evaluation and testing harness for OpenCode.

**Features:**
- Automated testing framework
- Performance benchmarking
- Test suite execution

### 4. `@jackoatmon/opencode-context-governor`
Context window management and optimization.

**Features:**
- Context budget management
- Session tracking
- Memory optimization

### 5. `@jackoatmon/opencode-runbooks`
Automated runbooks for common OpenCode tasks.

**Features:**
- Pre-defined workflows
- Automated remediation
- Best practices documentation

### 6. `@jackoatmon/opencode-proofcheck`
Code verification and validation.

**Features:**
- Code quality checks
- Verification protocols
- Validation rules

### 7. `@jackoatmon/opencode-memory-graph`
Memory graph visualization and management.

**Features:**
- Graph building
- Memory export
- Visualization tools

### 8. `@jackoatmon/opencode-fallback-doctor`
Fallback model management.

**Features:**
- Fallback validation
- Model switching
- Error recovery

## Development

### Adding a New Plugin

1. Create plugin directory:
   ```bash
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

3. Create plugin code in `src/index.js`

4. Link globally:
   ```bash
   bun link
   ```

5. Add to OpenCode config:
   ```json
   {
     "plugin": [
       "@jackoatmon/opencode-my-plugin@0.1.0"
     ]
   }
   ```

### Testing Changes

Changes to plugin code are immediately available due to symlink setup. No rebuild or republish needed.

```bash
cd opencode-model-router-x
# Edit src/index.js
# Test immediately:
opencode
```

## Package Structure

Each plugin should have:

```
opencode-my-plugin/
├── package.json       # Package metadata
├── README.md          # Plugin documentation
└── src/
    └── index.js       # Main entry point
```

## Versioning

All plugins use semantic versioning:
- **0.1.0** - Initial development
- **1.0.0** - Stable release
- **1.1.0** - Minor features added
- **2.0.0** - Breaking changes

Update `package.json` version when making significant changes.
