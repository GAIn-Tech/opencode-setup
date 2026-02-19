#!/usr/bin/env bash
set -euo pipefail

# Resolve HOME properly on Windows (handle /c/Users/xxx format)
if [[ "$HOME" == /c/* ]]; then
  HOME_DIR="${HOME#/c/}"
  HOME="C:/${HOME_DIR}"
fi

# Try to source .env if it exists in the workspace
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(dirname "$SCRIPT_DIR")"
if [ -f "$WORKSPACE_DIR/.env" ]; then
  source "$WORKSPACE_DIR/.env" 2>/dev/null || true
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

echo "[5.5/7] Env var alignment check"
# Validate that config env vars match what's in .env (warn only, don't fail)
if [ -f "$WORKSPACE_DIR/.env" ]; then
  env_vars_in_config=$(node -e "
    const c = JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8'));
    const vars = [];
    for (const [provider, config] of Object.entries(c.provider || {})) {
      if (config.options?.apiKey?.match(/{env:([^}]+)}/)) {
        vars.push({provider, var: '{env:' + provider.toUpperCase() + '_API_KEY}', singular: provider.toUpperCase() + '_API_KEY', plural: provider.toUpperCase() + '_API_KEYS'});
      }
    }
    console.log(JSON.stringify(vars));
  " 2>/dev/null || echo "[]")
  
  for row in $(echo "$env_vars_in_config" | node -e "
    const vars = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    vars.forEach(v => console.log(v.provider + '|' + v.singular + '|' + v.plural));
  " 2>/dev/null); do
    provider=$(echo "$row" | cut -d'|' -f1)
    singular=$(echo "$row" | cut -d'|' -f2)
    plural=$(echo "$row" | cut -d'|' -f3)
    
    # Check if either singular or plural var exists in .env
    if grep -q "^${singular}=" "$WORKSPACE_DIR/.env" 2>/dev/null; then
      echo "  OK: $provider → $singular (matches .env)"
    elif grep -q "^${plural}=" "$WORKSPACE_DIR/.env" 2>/dev/null; then
      echo "  OK: $provider → $plural (matches .env)"
    else
      echo "  WARN: $provider expects env var but not found in .env ($singular or $plural)"
    fi
  done
  
  echo "  OK: Env alignment check complete"
else
  echo "  SKIP: .env not found in workspace"
fi

echo "[6/7] Provider API keys"
# Dynamically check providers that require API keys (have apiKey config with {env:VAR})
node -e "
const fs = require('fs');
const c = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
const providers = [];
for (const [name, config] of Object.entries(c.provider || {})) {
  if (config.options?.apiKey?.match(/{env:([^}]+)}/)) {
    providers.push(name);
  }
}
console.log(providers.join(','));
" | tr ',' '\n' | while read provider; do
  [ -z "$provider" ] && continue
  
  # Try singular first, then plural
  key_singular="${provider^^}_API_KEY"
  key_plural="${provider^^}_API_KEYS"
  
  key_value=""
  if [ -n "${!key_singular:-}" ]; then
    key_value="${!key_singular}"
    key_name="$key_singular"
  elif [ -n "${!key_plural:-}" ]; then
    key_value="${!key_plural}"
    key_name="$key_plural"
  fi
  
  if [ -n "$key_value" ]; then
    echo "  OK: $provider has $key_name set"
  else
    echo "  WARN: $provider requires API key but not set ($key_singular or $key_plural)"
  fi
done
echo "  OK: Provider API key check complete"

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
