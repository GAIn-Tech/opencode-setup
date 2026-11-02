# AGENTS.md

## OVERVIEW
Integration layer package. 140 files, mostly test files (138 in tests/). Low code ratio (4%).

## STRUCTURE
```
src/                   # 5 code files
tests/                 # 138 test files
```

## WHERE TO LOOK
| If you need... | Look in... |
|----------------|------------|
| Integration logic | src/ |
| Test suite | tests/ (138 files) |

## CONVENTIONS
- **Test-Heavy**: 138 test files / 140 total = 99% test coverage
- **Low Code Ratio**: 5 code files / 140 total = 4%
- **Standard Entry Point**: src/index.js

## ANTI-PATTERNS
None specific to integration layer

## UNIQUE STYLES
- **Comprehensive Testing**: 138 test files for 5 source files (27:1 ratio)

## COMMANDS
| Command | Purpose |
|---------|---------|
| bun test packages/opencode-integration-layer/tests/ | Run integration tests (138 files) |
