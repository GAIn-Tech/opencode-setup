# opencode-cli-v2

Insulated Bun workspace for the next-generation OpenCode CLI migration (Kernel-First Strangler, Phase 1.1).

## Goals

- Fully isolated from existing `packages/` implementation details
- Strict TypeScript defaults (fail fast)
- Independent install/test lifecycle
- Workspace-local CI workflow scoped to `opencode-cli-v2/**`

## Quick Start

```bash
cd opencode-cli-v2
bun install
bun test
```

## Structure

```text
opencode-cli-v2/
├── README.md
├── package.json
├── bunfig.toml
├── tsconfig.json
├── .eslintrc.js
├── .prettierrc
├── .github/workflows/ci.yml
├── src/
│   └── kernel/
│       └── index.ts
└── tests/
    └── kernel.test.ts
```

## Insulation Rules

- No imports from `../packages/`
- No relative imports outside this workspace root
- This workspace must remain extractable into its own repository
