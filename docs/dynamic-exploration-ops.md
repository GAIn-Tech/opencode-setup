# Dynamic Exploration Ops Guide

## Overview
Dynamic exploration mode samples models to build performance memory and improve routing over time.

## Enable Exploration
Set environment variables:

```
OPENCODE_EXPLORATION_ACTIVE=true
OPENCODE_EXPLORATION_MODE=balanced
OPENCODE_EXPLORATION_BUDGET=20
OPENCODE_EXPLORATION_TOKEN_RATIO=0.1
OPENCODE_EXPLORATION_MIN_TOKENS=1000
```

## Manual CLI Activation
Run any process using model-router-x with:

```
node your-entrypoint.js --explore
```

## Monitoring
- Model comprehension DB: `~/.opencode/model-comprehension.db`
- Session budgets: `~/.opencode/session-budgets.json`

## Rollback
Disable exploration by setting:

```
OPENCODE_EXPLORATION_ACTIVE=false
```
