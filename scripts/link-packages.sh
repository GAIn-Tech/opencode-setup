#!/bin/bash
# Link all 8 opencode packages to the omc project

set -e

OMC_DIR="$HOME/.claude/plugins/marketplaces/omc"
PACKAGES_DIR="$HOME/work/opencode-setup/packages"

echo "Linking opencode packages to oh-my-claudecode..."

cd "$OMC_DIR"

# Link each package
for pkg in @jackoatmon/opencode-memory-graph \
           @jackoatmon/opencode-model-router-x \
           @jackoatmon/opencode-context-governor \
           @jackoatmon/opencode-runbooks \
           @jackoatmon/opencode-eval-harness \
           @jackoatmon/opencode-plugin-healthd \
           @jackoatmon/opencode-proofcheck \
           @jackoatmon/opencode-fallback-doctor; do
    echo "Linking $pkg..."
    npm link "$pkg" || echo "Warning: Failed to link $pkg"
done

echo "Done! Packages linked to oh-my-claudecode"
echo "You may need to restart Claude Code for changes to take effect"
