#!/usr/bin/env bash
set -euo pipefail

# Resolve HOME properly on Windows (handle /c/Users/xxx format)
if [[ "$HOME" == /c/* ]]; then
  HOME_DIR="${HOME#/c/}"
  HOME="C:/${HOME_DIR}"
fi

CONFIG_FILE="$HOME/.config/opencode/opencode.json"

echo "== OpenCode Health Check =="

echo "[1/7] CLI"
opencode --version >/dev/null
echo "  OK: opencode is installed"

echo "[2/7] Config JSON validity"
if node -e "JSON.parse(require('fs').readFileSync('$CONFIG_FILE'))" 2>/dev/null; then
  echo "  OK: opencode.json is valid JSON"
else
  echo "  FAIL: opencode.json is invalid JSON"
  exit 1
fi

echo "[3/7] Providers configured"
provider_count=$(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('$CONFIG_FILE')).provider || {}).length)")
echo "  OK: $provider_count providers configured"

echo "[4/7] Plugins"
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
  opencode-antigravity-quota \
  opencode-pty \
  envsitter-guard >/dev/null
echo "  OK: core plugins installed"

echo "[5/7] Secrets references"
if grep -Eq 'tvly-[A-Za-z0-9_-]{10,}|sm_[A-Za-z0-9_-]{20,}' "$CONFIG_FILE"; then
  echo "  FAIL: hardcoded Tavily/Supermemory secret found in config"
  exit 1
fi
echo "  OK: opencode.json uses env placeholders for Tavily/Supermemory"

echo "[6/7] Provider API keys"
providers_with_keys=0
providers_without_keys=0

# Check each provider for API keys
for provider in google anthropic openai nvidia groq cerebras deepseek; do
  key_var=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE')); const p=c.provider?.$provider?.options?.apiKey; console.log(p ? p.replace(/{env:([^}]+)}/,'\$1') : '')" 2>/dev/null)
  if [ -n "$key_var" ]; then
    key_value="${!key_var:-}"
    if [ -n "$key_value" ]; then
      echo "  OK: $provider has $key_var set"
      providers_with_keys=$((providers_with_keys + 1))
    else
      echo "  WARN: $provider configured but $key_var not set"
      providers_without_keys=$((providers_without_keys + 1))
    fi
  else
    echo "  SKIP: $provider has no apiKey config"
  fi
done
echo "  Summary: $providers_with_keys providers with keys, $providers_without_keys missing"

echo "[7/7] MCP config"
if ! opencode mcp list >/dev/null 2>&1; then
  echo "  WARN: unable to query MCP list (auth/session may be required)"
else
  echo "  OK: MCP list command responded"
fi

echo "== Health check complete =="

echo "[8/8] Ops kit checks"
if python "$(dirname "$0")/opencode_ops_kit.py" fallback-doctor >/dev/null 2>&1; then
  echo "  OK: fallback-doctor passed"
else
  echo "  WARN: fallback-doctor reported issues"
fi

if python "$(dirname "$0")/opencode_ops_kit.py" plugin-health --config "$CONFIG_FILE" >/dev/null 2>&1; then
  echo "  OK: plugin-health passed"
else
  echo "  WARN: plugin-health reported issues"
fi
