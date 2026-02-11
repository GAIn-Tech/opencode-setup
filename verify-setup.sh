#!/bin/bash
# Verify OpenCode custom plugins setup

echo "=========================================="
echo "OpenCode Custom Plugins Verification"
echo "=========================================="
echo ""

# Check if plugins are linked
echo "Checking globally linked plugins..."
linked_count=0
for plugin in opencode-context-governor opencode-eval-harness opencode-fallback-doctor opencode-memory-graph opencode-model-router-x opencode-plugin-healthd opencode-proofcheck opencode-runbooks; do
  if [ -L ~/.bun/install/global/node_modules/@jackoatmon/$plugin ]; then
    echo "  ✓ @jackoatmon/$plugin"
    ((linked_count++))
  else
    echo "  ✗ @jackoatmon/$plugin (not linked)"
  fi
done
echo ""

if [ $linked_count -eq 8 ]; then
  echo "✓ All 8 custom plugins are linked"
else
  echo "✗ Only $linked_count/8 plugins are linked"
  echo "  Run: ./setup.sh to fix"
  exit 1
fi
echo ""

# Check OpenCode config
echo "Checking OpenCode configuration..."
if [ -f ~/.config/opencode/opencode.json ]; then
  echo "  ✓ opencode.json exists"

  # Check if custom plugins are in config
  config_plugins=$(grep -c "@jackoatmon/opencode-" ~/.config/opencode/opencode.json || true)
  if [ $config_plugins -gt 0 ]; then
    echo "  ✓ Custom plugins found in config ($config_plugins entries)"
  else
    echo "  ✗ No custom plugins in config"
    echo "    Add them to ~/.config/opencode/opencode.json"
  fi
else
  echo "  ✗ opencode.json not found"
  echo "    Copy from: cp opencode-config/opencode.json ~/.config/opencode/"
fi
echo ""

# Check OpenCode installation
echo "Checking OpenCode installation..."
if command -v opencode >/dev/null 2>&1; then
  opencode_version=$(opencode --version 2>&1)
  echo "  ✓ OpenCode $opencode_version"
else
  echo "  ✗ OpenCode not installed"
  echo "    Install: npm install -g opencode-ai"
  exit 1
fi
echo ""

echo "=========================================="
echo "Verification Complete!"
echo "=========================================="
echo ""
echo "Setup is ready. Run: opencode"
