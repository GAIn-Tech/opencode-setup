# AGENTS.md

## OVERVIEW
Sisyphus state management package. 347 files, mostly test database artifacts. Core state machine for workflow orchestration.

## STRUCTURE
```
src/                   # 13 code files
test-*.db              # 244 test database files (test artifacts, not source)
tests/                 # Test suite
```

## WHERE TO LOOK
| If you need... | Look in... |
|----------------|------------|
| State machine logic | src/ |
| Test suite | tests/ |

## CONVENTIONS
- **Test DB Artifacts**: 244 test-*.db files in package root (cleanup needed)
- **Unique DB Naming**: `${TEST_DB_BASE}-${Date.now()}-${Math.random()}.db` per test
- **Low Code Ratio**: 13 code files / 347 total = 4% (mostly test artifacts)

## ANTI-PATTERNS
- **Test DB Cleanup**: Test databases not cleaned up after test runs (244 files accumulated)

## UNIQUE STYLES
- **Timestamped Test DBs**: Each test creates unique database with timestamp + random suffix

## COMMANDS
| Command | Purpose |
|---------|---------|
| bun test packages/opencode-sisyphus-state/tests/ | Run state machine tests |
| find . -name 'test-*.db*' -delete | Clean up test database artifacts |
