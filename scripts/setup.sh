#!/bin/bash
# OpenCode Setup - One-command setup script
# Run this to set up the complete environment

set -e

echo "========================================="
echo "OpenCode Setup - Environment Installer"
echo "========================================="

# Check for Bun
if ! command -v bun &> /dev/null; then
    echo "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    source ~/.bashrc 2>/dev/null || true
    export PATH="$HOME/.bun/bin:$PATH"
fi

# Verify Bun version
BUN_VERSION=$(bun --version 2>/dev/null | cut -d. -f1,2)
REQUIRED_VERSION="1.1"

if [[ "$(printf '%s\n' "$REQUIRED_VERSION" "$BUN_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]]; then
    echo "Installing Bun v1.1.12..."
    bun install -g bun@1.1.12
fi

echo "Bun version: $(bun --version)"

# Install dependencies
echo "Installing dependencies..."
bun install --frozen-lockfile

# Verify installation
echo "Verifying installation..."
bun run health 2>/dev/null || echo "Health check not available"

# Create required directories
echo "Creating directories..."
mkdir -p .opencode data logs

# Copy .env if not exists
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "Created .env from template - please configure your API keys"
    else
        echo "Warning: No .env.example found"
    fi
fi

echo "========================================="
echo "Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Configure your API keys in .env"
echo "  2. Run: make dev"
echo "  3. Or: bun run packages/opencode-dashboard/src/index.js"
echo ""
