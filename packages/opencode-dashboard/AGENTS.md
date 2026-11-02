# AGENTS.md

## OVERVIEW
Next.js 14 dashboard for OpenCode monitoring, model management, and system health. App Router with 40+ API routes.

## STRUCTURE
```
src/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Root page
│   └── api/                    # 40+ API routes
│       ├── monitoring/         # Metrics + alerts (Prometheus format)
│       ├── models/             # Lifecycle, audit, transition
│       ├── orchestration/      # Policy sim, status
│       ├── learning/           # Learning engine integration
│       ├── memory-graph/       # Memory graph visualization
│       ├── providers/          # Provider status
│       └── health/             # System health checks
├── components/
│   └── lifecycle/              # LifecycleBadge, StateTransitionModal, AuditLogViewer
└── lib/
    └── data-sources/           # Data fetching utilities

.next/                          # Build output (only package with build step)
```

## WHERE TO LOOK
| If you need... | Look in... |
|----------------|------------|
| API endpoints | src/app/api/ |
| UI components | src/components/ |
| Data fetching | src/lib/data-sources/ |
| Root layout | src/app/layout.tsx |
| Monitoring API | src/app/api/monitoring/route.ts |
| Model lifecycle API | src/app/api/models/lifecycle/route.ts |

## CONVENTIONS
- **Next.js App Router**: Uses layout.tsx, page.tsx, route.ts conventions
- **No "main" field**: Next.js app, not a library
- **Build Output**: .next/ directory (only package with build step)
- **API Routes**: 40+ routes under src/app/api/
- **Prometheus Format**: Monitoring metrics exposed in both JSON and Prometheus format

## ANTI-PATTERNS
None specific to dashboard (follows Next.js conventions)

## UNIQUE STYLES
- **Lifecycle Components**: LifecycleBadge, StateTransitionModal, AuditLogViewer for model management UI
- **Dual Format APIs**: JSON + Prometheus metrics
- **In-Memory Monitoring**: Metrics stored in-memory (not SQLite) for low overhead

## COMMANDS
| Command | Purpose |
|---------|---------|
| bun run build | Build Next.js dashboard (.next/ output) |
| bun run dev | Start development server |
| bun test packages/opencode-dashboard/tests/ | Run dashboard tests |
