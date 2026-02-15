#!/bin/bash
# Link all opencode workspace packages via bun link
# Portable: derives paths from script location, not hardcoded paths

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGES_DIR="$REPO_ROOT/packages"

# Read scope from env or derive from package.json
PLUGIN_SCOPE="${PLUGIN_SCOPE:-@jackoatmon}"

echo "Linking opencode packages..."
echo "  Repo root: $REPO_ROOT"
echo "  Packages:  $PACKAGES_DIR"
echo ""

if [ ! -d "$PACKAGES_DIR" ]; then
  echo "ERROR: Packages directory not found: $PACKAGES_DIR"
  echo "Are you running this from the opencode-setup repo?"
  exit 1
fi

# Dynamically find all packages (no hardcoded list)
linked=0
failed=0
for pkg_dir in "$PACKAGES_DIR"/opencode-*/; do
  if [ -f "$pkg_dir/package.json" ]; then
    pkg_name=$(basename "$pkg_dir")
    echo "Linking $pkg_name..."
    if (cd "$pkg_dir" && bun link 2>/dev/null); then
      linked=$((linked + 1))
    else
      echo "  Warning: Failed to link $pkg_name"
      failed=$((failed + 1))
    fi
  fi
done

echo ""
echo "Done! Linked $linked packages ($failed warnings)"
[ $failed -gt 0 ] && echo "Re-run with 'bun install' first if packages failed to link."
echo "You may need to restart opencode for changes to take effect."
