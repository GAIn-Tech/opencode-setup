#!/bin/bash
# OpenCode Custom Plugins Setup Script
# Run this script after cloning the repo to set everything up

set -e

echo "=========================================="
echo "OpenCode Custom Plugins Setup"
echo "=========================================="
echo ""

# Validate JSON file before copying
validate_json() {
  local file="$1"
  if node -e "JSON.parse(require('fs').readFileSync('$file', 'utf8'))" 2>/dev/null; then
    return 0
  else
    echo "  ✗ INVALID JSON: $file"
    return 1
  fi
}

# Copy JSON with validation
copy_json() {
  local src="$1"
  local dest="$2"
  local name="$3"
  if validate_json "$src"; then
    cp "$src" "$dest"
    echo "  ✓ $name"
  else
    echo "  ✗ Skipped $name due to invalid JSON"
    return 1
  fi
}

# Check prerequisites
echo "Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is not installed. Please install Node.js 18+"; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "Error: Bun is not installed. Run: npm install -g bun"; exit 1; }
command -v opencode >/dev/null 2>&1 || { echo "Error: OpenCode is not installed. Run: npm install -g opencode-ai"; exit 1; }
echo "✓ All prerequisites found"
echo ""

# Install workspace dependencies
echo "Installing workspace dependencies..."
bun install
echo "✓ Workspace installed"
echo ""

# Link all custom plugins globally
echo "Linking custom plugins globally..."
cd packages
for dir in opencode-*/; do
  plugin_name=$(basename "$dir")
  echo "  Linking $plugin_name..."
  cd "$dir"
  bun link > /dev/null 2>&1
  cd ..
done
cd ..
echo "✓ All plugins linked"
echo ""

# Install local git hooks for governance
if [ -d .git ]; then
  echo "Installing local git hooks..."
  node scripts/install-git-hooks.mjs
  echo "✓ Git hooks installed"
  echo ""
fi

# Backup existing config if it exists
if [ -f ~/.config/opencode/opencode.json ]; then
  echo "Backing up existing opencode.json..."
  cp ~/.config/opencode/opencode.json ~/.config/opencode/opencode.json.backup.$(date +%Y%m%d_%H%M%S)
  echo "✓ Backup created"
  echo ""
fi

# Copy config files
echo "Setting up configuration files..."
mkdir -p ~/.config/opencode
mkdir -p ~/.opencode

if [ -d opencode-config ]; then
  # Core configs → ~/.config/opencode/ (with JSON validation)
  [ -f opencode-config/opencode.json ] && copy_json opencode-config/opencode.json ~/.config/opencode/opencode.json "opencode.json"
  [ -f opencode-config/antigravity.json ] && copy_json opencode-config/antigravity.json ~/.config/opencode/antigravity.json "antigravity.json"
  [ -f opencode-config/oh-my-opencode.json ] && copy_json opencode-config/oh-my-opencode.json ~/.config/opencode/oh-my-opencode.json "oh-my-opencode.json"
  [ -f opencode-config/compound-engineering.json ] && copy_json opencode-config/compound-engineering.json ~/.config/opencode/compound-engineering.json "compound-engineering.json"
  [ -f opencode-config/rate-limit-fallback.json ] && copy_json opencode-config/rate-limit-fallback.json ~/.config/opencode/rate-limit-fallback.json "rate-limit-fallback.json"
  [ -f opencode-config/deployment-state.json ] && copy_json opencode-config/deployment-state.json ~/.config/opencode/deployment-state.json "deployment-state.json"
  [ -f opencode-config/learning-update-policy.json ] && copy_json opencode-config/learning-update-policy.json ~/.config/opencode/learning-update-policy.json "learning-update-policy.json"
  [ -f opencode-config/supermemory.json ] && copy_json opencode-config/supermemory.json ~/.config/opencode/supermemory.json "supermemory.json"
  [ -f opencode-config/tool-tiers.json ] && copy_json opencode-config/tool-tiers.json ~/.config/opencode/tool-tiers.json "tool-tiers.json"
  # Learning updates directory
  if [ -d opencode-config/learning-updates ]; then
    mkdir -p ~/.config/opencode/learning-updates
    # Validate each JSON file before copying
    for f in opencode-config/learning-updates/*.json; do
      [ -f "$f" ] && copy_json "$f" ~/.config/opencode/learning-updates/$(basename "$f") "$(basename "$f")"
    done
    echo "  ✓ learning-updates/"
  fi
  # Models directory (catalog, schema)
  if [ -d opencode-config/models ]; then
    mkdir -p ~/.config/opencode/models
    for f in opencode-config/models/*.json; do
      [ -f "$f" ] && copy_json "$f" ~/.config/opencode/models/$(basename "$f") "$(basename "$f")"
    done
    echo "  ✓ models/"
  fi
  # Docs directory
  if [ -d opencode-config/docs ]; then
    mkdir -p ~/.config/opencode/docs
    cp -r opencode-config/docs/* ~/.config/opencode/docs/ 2>/dev/null && echo "  ✓ docs/"
  fi
  # config.yaml → ~/.opencode/
  [ -f opencode-config/config.yaml ] && cp opencode-config/config.yaml ~/.opencode/config.yaml && echo "  ✓ config.yaml"
fi
    cp -r opencode-config/docs/* ~/.config/opencode/docs/ 2>/dev/null && echo "  ✓ docs/"
  fi
  # config.yaml → ~/.opencode/
  [ -f opencode-config/config.yaml ] && cp opencode-config/config.yaml ~/.opencode/config.yaml && echo "  ✓ config.yaml"
fi
echo ""

# Generate local MCP artifacts from templates
echo "Generating MCP config artifacts..."
node scripts/generate-mcp-config.mjs
echo "✓ MCP artifacts generated"
echo ""

# Summary
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Custom plugins installed:"
cd packages
for dir in opencode-*/; do
  plugin_name=$(cat "$dir/package.json" | grep '"name"' | head -1 | cut -d'"' -f4)
  plugin_version=$(cat "$dir/package.json" | grep '"version"' | head -1 | cut -d'"' -f4)
  echo "  • $plugin_name@$plugin_version"
done
cd ..
echo ""
echo "Next steps:"
echo "  1. Configure your API keys in ~/.config/opencode/opencode.json"
echo "  2. Run: opencode"
echo ""
echo "For more information, see INSTALL.md"
