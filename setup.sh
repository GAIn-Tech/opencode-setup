#!/bin/bash
# OpenCode Custom Plugins Setup Script
# Run this script after cloning the repo to set everything up

set -e

echo "=========================================="
echo "OpenCode Custom Plugins Setup"
echo "=========================================="
echo ""

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
  [ -f opencode-config/opencode.json ] && cp opencode-config/opencode.json ~/.config/opencode/opencode.json && echo "  ✓ opencode.json"
  [ -f opencode-config/antigravity.json ] && cp opencode-config/antigravity.json ~/.config/opencode/antigravity.json && echo "  ✓ antigravity.json"
  [ -f opencode-config/oh-my-opencode.json ] && cp opencode-config/oh-my-opencode.json ~/.config/opencode/oh-my-opencode.json && echo "  ✓ oh-my-opencode.json"
  [ -f opencode-config/compound-engineering.json ] && cp opencode-config/compound-engineering.json ~/.config/opencode/compound-engineering.json && echo "  ✓ compound-engineering.json"
  [ -f opencode-config/config.yaml ] && cp opencode-config/config.yaml ~/.opencode/config.yaml && echo "  ✓ config.yaml"
fi
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
