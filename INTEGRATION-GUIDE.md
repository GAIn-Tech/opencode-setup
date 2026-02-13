# Integration Guide for Custom Packages

**For users unfamiliar with the OpenCode setup, here's how to use and extend each component.**

---

## 📦 Custom Packages Integration

### 1. **opencode-context-governor** (Token Budget Management)

**What it does:** Prevents token budget overruns by tracking tokens per session/model.

**Integration:**
```js
const Governor = require('opencode-context-governor');
const gov = new Governor();

// Check if safe to proceed
if (!gov.checkBudget('ses_123', 'claude-opus-4-6', 5000)) {
  console.warn('Approaching budget limit');
  // Trigger new session or fallback model
}

// Track usage
gov.consumeTokens('ses_123', 'claude-opus-4-6', 2500);

// Get remaining
const remaining = gov.getRemainingBudget('ses_123', 'claude-opus-4-6');
```

**Configuration:** Edit `~/.config/opencode/opencode.json` → add to plugins list
```json
"opencode-context-governor@1.0.0"
```

**Activation:** Automatically enabled when plugin loaded. No additional config needed.

---

### 2. **opencode-eval-harness** (Model Benchmarking)

**What it does:** Benchmarks models against 10 test cases, exports results (JSON/CSV).

**Integration:**
```bash
# CLI usage
opencode-eval --json > results.json
opencode-eval --csv > results.csv
opencode-eval --compare "claude-opus-4-6" "claude-sonnet-4-5"
```

```js
// Programmatic usage
const Harness = require('opencode-eval-harness');
const harness = new Harness();

const results = await harness.runBenchmark('claude-opus-4-6', testSuite);
const comparison = harness.compareModels(['opus', 'sonnet', 'haiku']);
```

**Configuration:** Optional `.eval-harness-config.js` in project root
```js
module.exports = {
  testSuite: 'default', // or 'extended', or custom path
  iterations: 3,
  timeout: 30000
};
```

**Activation:** `npm install -g opencode-eval-harness`, then use CLI or require in code.

---

### 3. **opencode-fallback-doctor** (Model Chain Validation)

**What it does:** Validates 16-model fallback chain is Anthropic-primary and correct.

**Integration:**
```bash
# CLI usage
fallback-doctor diagnose ~/.config/opencode/rate-limit-fallback.json
fallback-doctor suggest ~/.config/opencode/rate-limit-fallback.json
```

```js
// Programmatic usage
const Doctor = require('opencode-fallback-doctor');
const doctor = new Doctor();

const diagnosis = doctor.diagnose(config.fallbackChain);
if (!diagnosis.valid) {
  const suggestions = doctor.suggestFix(diagnosis.issues);
  console.log(suggestions);
}
```

**Configuration:** None needed (diagnostic only).

**Activation:** Run manually before deploying model changes.

---

### 4. **opencode-goraphdb-bridge** (Graph Database REST Wrapper)

**What it does:** Unified REST client over goraphdb HTTP API for all 3 graph use cases.

**Requires:** goraphdb sidecar running on localhost:7687

**Deployment:**
```bash
# Option 1: Docker
docker run -p 7687:7687 -v ~/goraphdb-data:/data goraphdb:latest

# Option 2: Build from source
cd /tmp/goraphdb && go build -o goraphdb ./cmd/graphdb
./goraphdb --port 7687 --data-dir ~/goraphdb-data
```

**Integration:**
```js
const Bridge = require('opencode-goraphdb-bridge');
const bridge = new Bridge({ host: 'localhost', port: 7687 });

// Initialize schemas
await bridge.initializeSchemas();

// Use named queries
const errorFreq = await bridge.namedQuery('ErrorFrequency', {
  session_id: 'ses_123',
  days: 7
});

// Or raw Cypher
const results = await bridge.cypherQuery(
  'MATCH (s:Session)-[h:HIT_ERROR]->(e:Error) RETURN s, h, e LIMIT 10'
);
```

**Configuration:** `~/.config/opencode/opencode.json`
```json
{
  "plugins": ["opencode-goraphdb-bridge@1.0.0"],
  "bridgeConfig": {
    "host": "localhost",
    "port": 7687,
    "autoInitialize": true
  }
}
```

**Activation:**
1. Deploy goraphdb container/service
2. Add plugin to opencode.json
3. Bridge auto-initializes on plugin load

---

### 5. **opencode-learning-engine** (Anti-Pattern Catalog + Advisor)

**What it does:** Learns from session logs to detect anti-patterns and suggest better approaches.

**Integration:**
```js
const Engine = require('opencode-learning-engine');
const engine = new Engine();

// Ingest historical sessions
await engine.ingestAllSessions(); // Parses ~/.opencode/messages/

// Get advice for a task
const advice = engine.advise({
  task: 'Fix authentication bug',
  context: { attempts: 2, file: 'auth.ts' }
});
// Returns: {warnings: [...], suggestions: [...], routing: {...}}

// Learn from outcome
engine.learnFromOutcome('task_123', { success: true, time: 120 });

// Get report
const report = engine.getReport();
```

**Configuration:** `~/.config/opencode/opencode.json`
```json
{
  "plugins": ["opencode-learning-engine@1.0.0"],
  "learningConfig": {
    "autoIngestOnStart": true,
    "antiPatternWeight": 2.0,
    "positivePatternWeight": 0.5
  }
}
```

**Anti-Patterns (HEAVY):** failed_debug, inefficient_solution, repeated_mistake, wrong_tool, type_suppression, shotgun_debug, broken_state

**Positive Patterns (SOFT):** efficient_debug, creative_solution, good_delegation, clean_refactor, fast_resolution

**Activation:**
1. Add plugin to opencode.json
2. Optionally: `engine.ingestAllSessions()` to backfill
3. Plugin advisor is queried before delegating to agents

---

### 6. **opencode-memory-graph** v2.1.0 (Graph Activation + Retroactive Backfill)

**What it does:** Persistent error-to-session mapping with retroactive backfill from 6 existing sessions.

**Key Feature:** OFF by default, activate on demand, backfill historical data.

**Integration:**
```js
const MemoryGraph = require('opencode-memory-graph');
const graph = new MemoryGraph();

// Check if active
const isActive = await graph.isActive();

// Activate + backfill
if (!isActive) {
  await graph.activate(); // Scans ~/.opencode/messages/, builds graph
  const status = await graph.activationStatus();
  console.log(`Tracking ${status.sessions_tracked} sessions`);
}

// Use graph features
const errorFreq = await graph.getErrorFrequency();
const sessionPath = await graph.getSessionPath('ses_123');

// Deactivate (data persists in goraphdb)
await graph.deactivate();
```

**Configuration:** `~/.config/opencode/opencode.json`
```json
{
  "plugins": ["opencode-memory-graph@2.1.0"],
  "memoryGraphConfig": {
    "enabled": false,  // OFF by default
    "autoBackfill": true,
    "persistenceEngine": "goraphdb"  // or "memory" if goraphdb unavailable
  }
}
```

**Activation:**
1. Update opencode.json (set `enabled: false` by default)
2. When user wants graph features: `await graph.activate()`
3. Graph auto-backfills from ~/.opencode/messages/ (6 sessions available)
4. New sessions auto-feed to graph once active

**State File:** `~/.opencode/graph-memory-state.json`

---

### 7. **opencode-model-router-x** (Policy-Based Model Selection)

**What it does:** Selects models dynamically based on task complexity + success history.

**Integration:**
```js
const Router = require('opencode-model-router-x');
const router = new Router();

// Select model for a task
const model = router.selectModel({
  complexity: 'high',          // trivial, low, medium, high, critical
  outcome_history: [true, true, false, true]  // recent successes/failures
});
// Returns: 'claude-opus-4-6' (for high complexity)

// Record outcome to update success rates
router.recordOutcome('claude-opus-4-6', true, 2500); // model, success, latency_ms
```

**Configuration:** `~/.config/opencode/oh-my-opencode.json`
```json
{
  "routerConfig": {
    "anthropicWeight": 0.6,
    "costTierWeighting": true,
    "liveSuccessRateTracking": true
  }
}
```

**Activation:** Enabled in oh-my-opencode.json by default. Works alongside sisyphus agent.

---

### 8. **opencode-plugin-healthd** (Health Daemon)

**What it does:** Runs every 5 minutes to detect plugin duplicates, missing MCPs, dependency issues.

**Integration:**
```bash
# Start daemon
npm start opencode-plugin-healthd

# Check health
opencode-plugin-healthd check

# View logs
tail -f ~/.opencode/healthd.log
```

**Configuration:** No config needed. Auto-starts with OpenCode.

**Activation:** `npm install -g opencode-plugin-healthd`. Runs automatically.

---

### 9. **opencode-proofcheck** (Deployment Gate)

**What it does:** Verifies git clean + tests passing before commit/push.

**Integration:**
```bash
# Check readiness to deploy
proofcheck verify

# Enforce gate before commit
git commit -m "message" && proofcheck gate
```

```js
// Programmatic usage
const Checker = require('opencode-proofcheck');
const checker = new Checker();

const ready = await checker.gateDeployment('main');
if (!ready.passed) {
  console.log('Issues:', ready.issues);
  // Resolve issues before committing
}
```

**Configuration:** Optional `proofcheck.config.js`
```js
module.exports = {
  checkGitStatus: true,
  checkTests: true,
  checkLint: true,
  allowOverride: true  // --force flag
};
```

**Activation:** `npm install -g opencode-proofcheck`. Use before git push.

---

### 10. **opencode-runbooks** v2.0.0 (Auto-Remediation + Graph Resolver)

**What it does:** 7+ error patterns → automatic remediation suggestions. Optional multi-hop graph resolver.

**Integration:**
```js
const Runbooks = require('opencode-runbooks');
const runbooks = new Runbooks();

// Match error to pattern
const matched = runbooks.matchError('ENOENT: no such file or directory');
// Returns: {error_id: 'FILE_NOT_FOUND', severity: 'low', ...}

// Get remedy
const remedy = runbooks.getRemedy('FILE_NOT_FOUND');
// Returns: {action: 'Create file', suggestion: 'touch path/to/file', ...}

// For multi-hop chains (requires bridge):
const chain = await runbooks.getRemediationChain('ECONNREFUSED', bridge);
// Returns: [{remedy, confidence_score, success_rate}, ...]
```

**Configuration:** `~/.config/opencode/opencode.json`
```json
{
  "plugins": ["opencode-runbooks@2.0.0"],
  "runbooksConfig": {
    "graphResolverEnabled": false,  // Enable if goraphdb available
    "autoExecute": false,            // Require approval before applying
    "confidenceThreshold": 0.7
  }
}
```

**Error Types (7+):**
- MCP_NOT_FOUND
- RATE_LIMIT
- ENV_VAR_MISSING
- PLUGIN_CONFLICT
- MODEL_UNAVAILABLE
- TOKEN_BUDGET_EXCEEDED
- SUPERMEMORY_AUTH_FAIL

**Activation:** Add plugin, errors auto-trigger runbooks. Graph resolver is optional.

---

### 15. **opencode-dashboard** (Agent Monitoring Dashboard)

**What it does:** Read-only Next.js web dashboard for monitoring agent workflows, tree progress, and Showboat evidence.

**Integration:**
```bash
# Start dashboard
cd packages/opencode-dashboard
npm install
npm run dev
# Dashboard available at http://localhost:3000
```

**Features:**
- **Workflow Tree:** Hierarchical visualization of sisyphus steps.
- **Evidence Viewer:** Integrated markdown renderer for Showboat proof.
- **Process Isolation:** Runs as a separate process; zero impact on agent stability.
- **Read-Only Safety:** Enforces `PRAGMA query_only = ON` for all SQLite reads.

**Configuration:** `packages/opencode-dashboard/src/lib/data-sources/config.ts` (Auto-detects shared state locations).

**Activation:** Run manually when visibility into complex multi-step tasks is required.

---

## 🔌 External Plugin Integration

### Adding a New Plugin

1. **Find plugin:** Search npm registry
   ```bash
   npm search opencode-plugin-[name]
   ```

2. **Add to config:** Edit `~/.config/opencode/opencode.json`
   ```json
   {
     "plugins": [
       ...existing plugins,
       "new-plugin-name@version"
     ]
   }
   ```

3. **Install globally:** OpenCode auto-installs on startup

4. **Configure:** Add plugin-specific config to same JSON file

5. **Test:** Run `opencode run "test command"` to verify loading

---

## 🎯 Adding New Skills

1. **Create skill:** Create `~/.config/opencode/skills/my-skill/SKILL.md`

2. **Structure:** Follow oh-my-opencode SKILL.md format

3. **Register:** Add to `compound-engineering.json`
   ```json
   {
     "skillsGlobal": [..., "my-skill"],
     "skills": { "my-skill": { "category": "custom", ... } }
   }
   ```

4. **Use:** Invoke via `/my-skill <input>` command

---

## 👥 Adding New Agents

1. **Configure:** Edit `oh-my-opencode.json`
   ```json
   {
     "agents": {
       "my-agent": {
         "model": "claude-opus-4-6",
         "role": "description",
         "tools": ["tool1", "tool2"]
       }
     }
   }
   ```

2. **Deploy:** Commit + push changes

3. **Use:** OpenCode routes tasks to agent based on context

---

### 11. **opencode-skill-rl-manager** (Hierarchical Skill Orchestration)

**What it does:** Implements SkillRL principles for intelligent skill selection using hierarchical skill banks (Universal + Task-Specific) with recursive evolution from failures.

**Integration:**
```js
const { SkillRLManager } = require('opencode-skill-rl-manager');
const skillRL = new SkillRLManager();

// Select skills for a task
const skills = skillRL.selectSkills({
  task: 'implement authentication system',
  complexity: 'high',
  files_involved: ['src/auth.js']
});

console.log('Selected skills:', skills.map(s => s.name));
// Output: ['verification-before-completion', 'test-driven-development', 'incremental-implementation']

// Learn from failure
skillRL.evolutionEngine.learnFromFailure({
  task_context: taskContext,
  error_description: 'Race condition in auth logic',
  timestamp: new Date().toISOString()
});
```

**Configuration:** Skill bank evolves automatically based on failures recorded via the `onFailureDistilled` hook in OrchestrationAdvisor.

**Activation:** Automatically active when integrated via IntegrationLayer (see below).

---

### 12. **opencode-showboat-wrapper** (Evidence Capture)

**What it does:** Orchestrates high-impact evidence capture using showboat markdown documents with Playwright assertions as the default verification method.

**Integration:**
```js
const { ShowboatWrapper } = require('opencode-showboat-wrapper');
const showboat = new ShowboatWrapper({ 
  outputDir: '.sisyphus/evidence' 
});

// Check if task is high-impact
if (showboat.isHighImpact({ task: 'Deploy auth', filesModified: 15 })) {
  // Generate evidence document
  const evidence = showboat.captureEvidence({
    task: 'Deploy authentication system',
    filesModified: 15,
    assertions: [
      { type: 'text', selector: '#login', expected: 'Sign in' },
      { type: 'element', selector: '#oauth-callback', exists: true }
    ],
    outcome: 'PASS',
    verification: { timestamp: new Date().toISOString() }
  });
  
  console.log('Evidence:', evidence.path);
}
```

**Configuration:** High-impact threshold defined in constructor:
```js
{
  filesModified: 10,  // Trigger if ≥10 files changed
  complexity: 'high',  // Trigger if complexity is 'high'
  keywords: ['deploy', 'migration', 'integration', 'refactor', 'architecture']
}
```

**Activation:** Automatically active when integrated via IntegrationLayer (see below).

---

### 13. **opencode-integration-layer** (SkillRL + Showboat Wiring)

**What it does:** Wires SkillRL and Showboat into existing packages (OrchestrationAdvisor, Proofcheck) via extension hooks.

**Full Workflow Integration:**
```js
const { IntegrationLayer } = require('opencode-integration-layer');
const { SkillRLManager } = require('opencode-skill-rl-manager');
const { ShowboatWrapper } = require('opencode-showboat-wrapper');
const { OrchestrationAdvisor } = require('opencode-learning-engine');
const { Proofcheck } = require('opencode-proofcheck');

// Setup components
const skillRL = new SkillRLManager();
const showboat = new ShowboatWrapper({ outputDir: '.sisyphus/evidence' });
const integration = new IntegrationLayer({ 
  skillRLManager: skillRL,
  showboatWrapper: showboat 
});

// Create integrated OrchestrationAdvisor
const advisor = integration.createIntegratedAdvisor(
  OrchestrationAdvisor,
  antiPatternCatalog,
  positivePatternTracker
);

// Create integrated Proofcheck
const proofcheck = integration.createIntegratedProofcheck(Proofcheck);

// Use integrated workflow
const taskContext = {
  task: 'Deploy production authentication',
  complexity: 'high',
  filesModified: 15
};

integration.setTaskContext(taskContext);

// Get advice (augmented by SkillRL)
const advice = advisor.advise(taskContext);
console.log('SkillRL skills:', advice.skillrl_skills);

// Run verification (evidence captured if high-impact)
await proofcheck.verify();
```

**Hook Points:**
- **OrchestrationAdvisor.onBeforeAdviceReturn**: SkillRL augments advice with skill selection
- **OrchestrationAdvisor.onFailureDistilled**: SkillRL evolves from failures
- **Proofcheck.onVerificationComplete**: Showboat captures evidence

**Configuration:** No additional config needed. Hooks are wired automatically when using `createIntegratedAdvisor()` and `createIntegratedProofcheck()`.

**Activation:** Manual integration in agent startup code. See `integration-tests/skillrl-showboat-e2e.test.js` for full example.

**Evidence as Handoff Artifact:**
```bash
# Evidence documents are machine-executable
showboat verify .sisyphus/evidence/evidence-*.md

# Use as handoff between machines
scp .sisyphus/evidence/latest.md remote:/handoff/
ssh remote "showboat verify /handoff/latest.md"
```

**Architecture Reference:** See `docs/architecture/integration-map.md` for complete API surface and extension hooks.

---

### 14. **opencode-sisyphus-state** (Durable Workflow Execution)

**What it does:** Provides a resilient state machine for agent workflows with SQLite-backed event sourcing, checkpointing, and resume capability.

**Integration:**
```js
const {
  WorkflowExecutor,
  WorkflowStore,
  createGovernorHandler,
  createRouterHandler,
  createSkillSelectionHandler,
  createLearningHandler,
  createShowboatHandler
} = require('opencode-sisyphus-state');

// Initialize store
const store = new WorkflowStore('~/.opencode/sisyphus.db');

// Configure handlers
const executor = new WorkflowExecutor(store);
executor.registerHandler('budget-check', createGovernorHandler(governor));
executor.registerHandler('model-select', createRouterHandler(router));
executor.registerHandler('skill-select', createSkillSelectionHandler(skillManager));
executor.registerHandler('learn-outcome', createLearningHandler(skillManager));
executor.registerHandler('capture-evidence', createShowboatHandler(showboat));
executor.registerHandler('generate-code', async (input) => {
  return { generated: true, input };
});

// Define workflow
const workflow = {
  name: 'refactor-auth',
  steps: [
    { id: 'check', type: 'budget-check', input: { tokens: 1000 } },
    { id: 'plan', type: 'generate-code', input: { task: 'plan' } }
  ]
};

// Execute (durable)
try {
  await executor.execute(workflow, { initial: 'context' });
} catch (err) {
  // Can resume later using runId
  console.log('Failed run:', err.runId);
}

// Resume (pass the same workflow definition)
await executor.resume(failedRunId, workflow);
```

**Features:**
- **Event Sourcing:** Complete audit log of all steps.
- **Idempotency:** Steps are checkpointed; completed steps are skipped on resume.
- **Resilience:** Exponential backoff retries for failed steps.
- **Parallel Execution:** `parallel-for` steps for concurrent tasks.

**Verification:**
```bash
# Package test suite (includes durability crash-resume coverage)
cd packages/opencode-sisyphus-state
bun test
```

**Activation:** Integrated into `sisyphus` agent loop.

---

## 🔍 Troubleshooting Integration

See `TROUBLESHOOTING.md` for common issues and fixes for each component.

Key diagnostic commands:
```bash
# Verify all plugins installed
npm list -g | grep opencode-

# Check opencode config syntax
jq . ~/.config/opencode/opencode.json

# Run health check
npm run health-check

# View system logs
tail -f ~/.opencode/logs/system.log
```

---

## 📚 Documentation Map

| Document | Purpose |
|----------|---------|
| **COMPLETE-INVENTORY.md** | Full list of all plugins, MCPs, agents, skills |
| **INTEGRATION-GUIDE.md** | This file — how to use each component |
| **SETUP.md** | Initial setup instructions |
| **TROUBLESHOOTING.md** | Common issues + fixes |
| **PLUGINS.md** | Detailed plugin documentation |
| **MCP-REFERENCE.md** | MCP server details + toggle instructions |
| **AGENT-GUIDE.md** | How to use each agent |
| **SKILL-DEVELOPMENT.md** | How to create custom skills |
| **DEPLOYMENT.md** | Production deployment guide |
| **FAQ.md** | Frequently asked questions |
