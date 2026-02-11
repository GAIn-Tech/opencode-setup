#!/usr/bin/env bash
set -euo pipefail

echo "== OpenCode Health Check =="

echo "[1/6] CLI"
opencode --version >/dev/null
echo "  OK: opencode is installed"

echo "[2/6] Plugins"
npm list -g --depth=0 \
  oh-my-opencode \
  opencode-antigravity-auth \
  opencode-supermemory \
  @tarquinen/opencode-dcp \
  cc-safety-net \
  @azumag/opencode-rate-limit-fallback \
  @mohak34/opencode-notifier \
  opencode-plugin-langfuse \
  opencode-plugin-preload-skills \
  @symbioticsec/opencode-security-plugin \
  opencode-token-monitor \
  envsitter-guard >/dev/null
echo "  OK: core plugins installed"

echo "[3/6] Secrets references"
if grep -Eq 'tvly-[A-Za-z0-9_-]{10,}|sm_[A-Za-z0-9_-]{20,}' "$HOME/.config/opencode/opencode.json"; then
  echo "  FAIL: hardcoded Tavily/Supermemory secret found in ~/.config/opencode/opencode.json"
  exit 1
fi
echo "  OK: opencode.json uses env placeholders for Tavily/Supermemory"

echo "[4/6] MCP config"
if ! opencode mcp list >/dev/null 2>&1; then
  echo "  WARN: unable to query MCP list (auth/session may be required)"
else
  echo "  OK: MCP list command responded"
fi

echo "[5/6] Critical env vars"
missing=0
for key in TAVILY_API_KEY SUPERMEMORY_TOKEN GITHUB_TOKEN; do
  if [ -z "${!key:-}" ]; then
    echo "  WARN: $key is not set"
    missing=1
  fi
done
if [ "$missing" -eq 0 ]; then
  echo "  OK: required env vars are set"
fi

echo "[6/6] Model smoke test"
if opencode run "ping" --model=google/antigravity-gemini-3-pro >/dev/null 2>&1; then
  echo "  OK: default model request succeeded"
else
  echo "  WARN: model smoke test failed (check auth/quota/network)"
fi

echo "== Health check complete =="
