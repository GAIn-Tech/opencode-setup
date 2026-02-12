#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="$ROOT_DIR/.githooks"

if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "install-git-hooks: not a git repository at $ROOT_DIR"
  exit 1
fi

mkdir -p "$HOOKS_DIR"
chmod +x "$HOOKS_DIR/commit-msg" "$HOOKS_DIR/pre-push"

git -C "$ROOT_DIR" config core.hooksPath .githooks

echo "install-git-hooks: enabled core.hooksPath=.githooks"
