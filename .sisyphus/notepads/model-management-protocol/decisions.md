# Architectural Decisions - Model Management Protocol

## [2026-02-24T10:20:00Z] Session Start

### User Decisions
1. **Authority**: Auto-apply metadata changes, PRs for new models
2. **Risk Threshold**: 0-50 auto-approve, 50-80 manual review, >80 blocked
3. **Notifications**: GitHub Issues + Dashboard
4. **Test Approach**: Tests-after (implement then test)

### Architecture Choices
1. **Package Structure**: `packages/opencode-model-manager/` for all new code
2. **Test Framework**: Bun test (built-in, no additional setup)
3. **Database**: SQLite for all persistence needs
4. **API Integration**: Dashboard API routes in `packages/opencode-dashboard/src/app/api/models/`

### Governance
- All governed file changes require learning updates in `opencode-config/learning-updates/`
- Commit format: Conventional commits with `Learning-Update` and `Risk-Level` trailers
- Learning update schema: id, timestamp, summary, affected_paths, validation, risk_level, notes
