# Issues & Gotchas - Model Management Protocol

## [2026-02-24T10:20:00Z] Session Start

### Known Issues
1. **LSP Warnings**: Cross-package references show errors in IDE but tests pass
   - Dashboard API routes importing from model-manager package
   - Expected behavior - monorepo structure
   
2. **Test File Syntax**: Some test files have minor syntax issues (groq.test.ts, cerebras.test.ts)
   - Tests still pass (253/253)
   - Non-blocking for current work

### Resolved Issues
- Learning update validation: Must use "pass", "fail", or "not-run" (not "not-applicable")
- Commit trailer format: Must include full path `opencode-config/learning-updates/{file}.json`
