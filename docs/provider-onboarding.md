# Provider Onboarding Guide

## Overview
This guide documents how to onboard a new model provider into OpenCode.

## Steps
1. Add provider entry in `opencode-config/opencode.json` under `provider`.
2. Update model router policies in `packages/opencode-model-router-x/src/policies.json`.
3. Configure API keys via environment variables.
4. Run discovery and benchmark checks.
5. Validate dashboard provider health.

## Verification
```
bun test packages/opencode-model-manager/test/
bun test packages/opencode-model-router-x/test/
```
