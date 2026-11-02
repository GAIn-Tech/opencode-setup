#!/bin/bash
# Link custom OpenCode plugins into OpenCode's cache directory

echo "=========================================="
echo "Linking Custom Plugins to OpenCode"
echo "=========================================="
echo ""

# Check if OpenCode is installed
if ! command -v opencode >/dev/null 2>&1; then
  echo "Error: OpenCode is not installed"
  echo "Install it with: npm install -g opencode"
  exit 1
fi

# Create the @jackoatmon directory in OpenCode's cache
mkdir -p ~/.cache/opencode/node_modules/@jackoatmon

# Link each plugin
cd "$(dirname "$0")/packages"
for pkg in opencode-*/; do
  pkg_name=$(basename "$pkg")
  echo "Linking $pkg_name..."

  # Remove existing symlink if it exists
  rm -f ~/.cache/opencode/node_modules/@jackoatmon/$pkg_name

  # Create new symlink
  ln -s "$(pwd)/$pkg" ~/.cache/opencode/node_modules/@jackoatmon/$pkg_name

  if [ -L ~/.cache/opencode/node_modules/@jackoatmon/$pkg_name ]; then
    echo "  ✓ Linked @jackoatmon/$pkg_name"
  else
    echo "  ✗ Failed to link @jackoatmon/$pkg_name"
  fi
done

echo ""
echo "=========================================="
echo "Linking Complete!"
echo "=========================================="
echo ""
echo "⚠️  IMPORTANT: Custom plugins are linked but NOT enabled in config"
echo ""
echo "These plugins are available in OpenCode's node_modules but are"
echo "NOT listed in ~/.config/opencode/opencode.json, so they won't load"
echo "automatically. This is intentional because:"
echo ""
echo "1. OpenCode tries to install plugins listed in opencode.json from npm"
echo "2. These custom plugins aren't published to npm"
echo "3. Adding them to the config causes OpenCode to fail on startup"
echo ""
echo "To use these plugins, you have two options:"
echo ""
echo "Option 1: Publish to npm (recommended for production)"
echo "  - Create npm automation token"
echo "  - Publish each package: cd packages/<name> && npm publish --access public"
echo "  - Add to opencode.json: \"@jackoatmon/package-name@0.1.0\""
echo ""
echo "Option 2: Load plugins programmatically (for development)"
echo "  - Plugins are symlinked and available in node_modules"
echo "  - Can be required/imported by other plugins or OpenCode internals"
echo "  - Won't auto-load on OpenCode startup"
echo ""
echo "For now, OpenCode will run without these custom plugins."
