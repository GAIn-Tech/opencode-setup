# Secrets Onboarding (New Machine)

## Goal

Use one repeatable path for secrets so OpenCode, MCP servers, and provider routing all work without editing committed config files.

## Source of Truth

- Keep secrets in local env files (`.env` preferred, `.env.project` fallback).
- Committed config references env placeholders (`{env:...}`) and never stores raw secrets.

## Required Variables

Minimum practical set:

- `SUPERMEMORY_API_KEY`
- `GITHUB_TOKEN` (if using GitHub MCP/tools)
- `TAVILY_API_KEY` (if using Tavily MCP)
- At least one provider key set:
  - `GOOGLE_API_KEYS`
  - `ANTHROPIC_API_KEYS`
  - `OPENAI_API_KEYS`

See `.env.example` for full list and optional keys.

## Setup Steps

1. Create local env file

```bash
cp .env.example .env
```

2. Fill secret values in `.env`.

3. Load env vars in PowerShell

```powershell
.\set-env.ps1
```

4. Optional persistence (survives terminal restart)

```powershell
.\set-env.ps1 -PersistUser
```

## Fallback Behavior

`set-env.ps1` now loads in this order:

1. `.env`
2. `.env.project` (with warning)
3. error with remediation if neither exists

This protects day-to-day usage if `.env` is temporarily missing.

## Verification

```bash
node scripts/env-contract-check.mjs
node scripts/health-check.mjs
```

Expected:

- env-contract-check passes required key presence
- health-check shows MCP/provider status based on enabled config and available keys

## Safety Notes

- `.env` and `.env.*` are ignored by git; do not commit secrets.
- Avoid destructive cleanup commands that target env files explicitly.
- If you use `git clean`, prefer scoped path cleanup (specific dirs/files), not broad sweeps.
