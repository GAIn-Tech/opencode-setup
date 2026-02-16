# OpenCode Dashboard v2 - Comprehensive Control Panel

## Overview

Transform the basic workflow dashboard into a comprehensive control panel for the entire OpenCode ecosystem.

## Data Sources Inventory

### 1. Workflow State (sisyphus-state)
- **Location**: `~/.opencode/sisyphus-state.db` (SQLite WAL-mode)
- **Tables**: workflow_runs, workflow_steps, audit_events
- **Update Pattern**: Real-time via file watching + SSE

### 2. Memory Graph (opencode-memory-graph)
- **Location**: Built from `~/.opencode/logs/`
- **Format**: Bipartite graph (sessions ↔ errors)
- **API**: buildGraph(), getGraph(), getErrorFrequency(), getSessions(), export()
- **Export**: JSON (nodes/edges/meta), DOT (graphviz), CSV

### 3. Learning Engine (opencode-learning-engine)
- **Location**: `~/.opencode/learning/anti-patterns.json`, `positive-patterns.json`
- **API**: getReport(), advise(), ingestSession(), learnFromOutcome()
- **Data**: Anti-patterns (shotgun_debug, repeated_mistake, type_suppression, broken_state)
- **Data**: Positive patterns (efficient_debug, creative_solution, good_delegation)

### 4. Skill RL Manager (opencode-skill-rl-manager)
- **Purpose**: Hierarchical skill orchestration with performance tracking
- **API**: skill-bank.js, evolution-engine.js

### 5. Configuration Files
- `~/.config/opencode/opencode.json` - Main OpenCode config
- `~/.config/opencode/oh-my-opencode.json` - Plugin config
- `.opencode.config.json` - Project-specific config
- `opencode-config-schema.json` - Config schema

### 6. Health & Monitoring
- **plugin-healthd**: `~/.opencode/healthd.log` (5-min health checks)
- **context-governor**: `~/.opencode/session-budgets.json` (token budgets)

### 7. Documentation
- `docs/` directory in opencode-setup
- README files in each package
- CLAUDE.md files

---

## Dashboard Sections

### Section 1: Workflow Monitor (Enhanced)
**Current**: Basic workflow list with steps/events
**Enhanced**:
- [ ] Real-time updates via SSE (no polling)
- [ ] Full workflow history with search/filter
- [ ] Workflow metadata: duration, agent used, token cost
- [ ] Step-level details: retries, error messages, outputs
- [ ] Timeline visualization
- [ ] Export workflow reports

### Section 2: Memory Graph Visualization
- [ ] Interactive graph viewer (D3.js or vis.js)
- [ ] Session → Error relationship view
- [ ] Error frequency heatmap
- [ ] Session path reconstruction
- [ ] Export to DOT/PNG for external tools
- [ ] Filter by date range, error type, session

### Section 3: Learning Insights
- [ ] Anti-pattern summary cards
- [ ] Positive pattern leaderboard
- [ ] Severity distribution charts
- [ ] Hotspot identification (files/functions with most issues)
- [ ] Recommendations panel
- [ ] Ingest new sessions manually
- [ ] Record outcomes for advice

### Section 4: Skill Performance (RL Suite)
- [ ] Skill usage statistics
- [ ] Performance metrics per skill
- [ ] Evolution history
- [ ] A/B comparison of skill strategies
- [ ] Manual skill promotion/demotion

### Section 5: Configuration Center
- [ ] View all config files (read-only)
- [ ] Config diff viewer (project vs user vs defaults)
- [ ] Schema validation status
- [ ] Quick edit for common settings
- [ ] Hooks configuration viewer

### Section 6: Health & Resources
- [ ] Plugin health status (from healthd.log)
- [ ] Token budget overview (from session-budgets.json)
- [ ] MCP server status
- [ ] Package versions and update status

### Section 7: Documentation Browser
- [ ] Markdown viewer for docs/
- [ ] Package README browser
- [ ] CLAUDE.md viewer
- [ ] Search across all docs

---

## Technical Architecture

### Real-Time Updates

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Dashboard                         │
├─────────────────────────────────────────────────────────────┤
│  Client                                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  EventSource('/api/events')                          │    │
│  │  - workflow:update                                   │    │
│  │  - learning:update                                   │    │
│  │  - health:update                                     │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  Server (API Routes)                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  /api/events (SSE endpoint)                          │    │
│  │  - chokidar watching ~/.opencode/                    │    │
│  │  - Broadcasts changes to connected clients           │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  /api/workflows - CRUD for workflow data             │    │
│  │  /api/memory-graph - Graph queries                   │    │
│  │  /api/learning - Learning engine API                 │    │
│  │  /api/config - Config file reader                    │    │
│  │  /api/health - Health status                         │    │
│  │  /api/docs - Documentation browser                   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### File Watching Strategy

1. **Primary**: chokidar watching key files:
   - `~/.opencode/sisyphus-state.db` (workflow changes)
   - `~/.opencode/learning/*.json` (learning updates)
   - `~/.opencode/healthd.log` (health updates)
   - `~/.opencode/session-budgets.json` (resource updates)

2. **Debouncing**: 100ms debounce on file changes to avoid spam

3. **SSE Broadcast**: Push updates to all connected clients

### New Dependencies

```json
{
  "chokidar": "^3.5.3",
  "d3": "^7.8.5",
  "react-markdown": "^9.0.1",
  "swr": "^2.2.4"
}
```

---

## Implementation Phases

### Phase 1: Real-Time Foundation (Priority: HIGH)
1. Add chokidar for file watching
2. Create SSE endpoint `/api/events`
3. Update client to use EventSource
4. Remove polling, use push updates

### Phase 2: Enhanced Workflows (Priority: HIGH)
1. Add workflow history pagination
2. Add search/filter capabilities
3. Add metadata display (duration, tokens, agent)
4. Add timeline visualization

### Phase 3: Memory Graph (Priority: HIGH)
1. Integrate opencode-memory-graph package
2. Add D3.js graph visualization
3. Add error frequency heatmap
4. Add session drill-down

### Phase 4: Learning Insights (Priority: HIGH)
1. Integrate opencode-learning-engine
2. Add anti-pattern cards
3. Add recommendations panel
4. Add outcome recording UI

### Phase 5: Config & Health (Priority: MEDIUM)
1. Add config file reader
2. Add health status display
3. Add resource monitoring

### Phase 6: Documentation (Priority: MEDIUM)
1. Add markdown viewer
2. Add docs browser
3. Add search

---

## Navigation Structure

```
OpenCode Dashboard
├── Workflows (default)
│   ├── Active Runs
│   ├── History
│   └── Analytics
├── Memory Graph
│   ├── Graph View
│   ├── Error Analysis
│   └── Session Explorer
├── Learning
│   ├── Anti-Patterns
│   ├── Positive Patterns
│   └── Recommendations
├── Skills
│   ├── Performance
│   └── Evolution
├── Settings
│   ├── Configuration
│   ├── Health
│   └── Resources
└── Docs
    ├── Guides
    └── Package Docs
```

---

## Status: PLANNING

Next steps:
1. Review and approve architecture
2. Begin Phase 1 implementation
