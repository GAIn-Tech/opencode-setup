# opencode-antigravity-auth

Multi-account Google OAuth rotation for Gemini API access.

- **Package**: `opencode-antigravity-auth@latest`
- **Source**: https://github.com/NoeFabris/opencode-antigravity-auth
- **Version**: 1.4.6+

## Features
- Rotate across multiple Google accounts for Gemini API
- Hybrid account selection strategy
- Cache-first scheduling for optimal quota usage
- Automatic switch on rate limit
- Proactive token refresh
- Session recovery and auto-resume

## Configuration
- `antigravity.json` — rotation strategy, quota thresholds, fallback settings
- `antigravity-accounts.json` — OAuth tokens per account (auto-generated, DO NOT commit)

## Key Settings
- `quota_fallback: true` — CRITICAL, enables fallback when quota exhausted
- `switch_on_first_rate_limit: true` — immediate switch on rate limit
- `soft_quota_threshold_percent: 90` — switch before hitting hard limit
