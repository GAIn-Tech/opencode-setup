'use strict';

const { afterEach, beforeEach, describe, expect, it, mock, test } = require('bun:test');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');

const { SnapshotStore } = require('../packages/opencode-model-manager/src/snapshot/snapshot-store');
const { ModelAssessor } = require('../packages/opencode-model-manager/src/assessment/model-assessor');
const {
  StateMachine,
  LIFECYCLE_STATES
} = require('../packages/opencode-model-manager/src/lifecycle/state-machine');
const { PRGenerator } = require('../packages/opencode-model-manager/src/automation/pr-generator');

const ROOT = path.join(__dirname, '..');
const MODEL_MANAGER_ROOT = path.join(ROOT, 'packages', 'opencode-model-manager', 'src');
const WEEKLY_SYNC_PATH = path.join(ROOT, 'scripts', 'weekly-model-sync.mjs');
const CATALOG_PATH = path.join(ROOT, 'opencode-config', 'models', 'catalog-2026.json');
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');
const MODEL_SYNC_WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'model-catalog-sync.yml');

function makeModel(overrides = {}) {
  return {
    id: overrides.id || 'openai/gpt-5',
    provider: overrides.provider || 'openai',
    displayName: overrides.displayName || 'GPT-5',
    contextTokens: overrides.contextTokens ?? 128000,
    outputTokens: overrides.outputTokens ?? 4096,
    deprecated: overrides.deprecated ?? false,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      reasoning: false,
      ...(overrides.capabilities || {})
    }
  };
}

function makeMockAdapter(models) {
  return { list: async () => models };
}

function createCatalogFixture() {
  return {
    version: '2026-04-30',
    lastUpdated: '2026-04-30T00:00:00.000Z',
    models: {
      'openai/gpt-4': {
        id: 'gpt-4',
        provider: 'openai',
        status: 'active',
        capabilities: {
          contextWindow: 8192,
          maxOutputTokens: 2048,
          vision: false,
          functionCalling: true,
          jsonMode: true,
          systemPrompt: true
        }
      }
    }
  };
}

describe('model-management automation remediation contract', () => {
  it('exports one reusable automation runner from the package surface', () => {
    const modelManager = require(path.join(MODEL_MANAGER_ROOT, 'index.js'));

    expect(typeof modelManager.runModelManagementCycle).toBe('function');
  });

  it('keeps the canonical model catalog in object-map form', () => {
    const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));

    expect(Array.isArray(catalog.models)).toBe(false);
    expect(typeof catalog.models).toBe('object');
    expect(catalog.models['openai/gpt-5.3-codex']).toBeDefined();
  });

  it('exposes a non-mutating catalog preview seam before live PR execution', () => {
    const { PRGenerator } = require(path.join(MODEL_MANAGER_ROOT, 'automation', 'pr-generator.js'));
    const generator = new PRGenerator({
      catalogPath: CATALOG_PATH,
      repoPath: ROOT
    });

    expect(typeof generator.previewCatalogUpdate).toBe('function');
  });

  it('wires weekly sync to a reusable automation runner contract', () => {
    const weeklySyncSource = fs.readFileSync(WEEKLY_SYNC_PATH, 'utf8');

    expect(weeklySyncSource).toContain('runModelManagementCycle');
    expect(weeklySyncSource).toContain('runWeeklyModelSync');
  });

  it('runs the public models:sync package script through Bun', () => {
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));

    expect(packageJson.scripts['models:sync']).toBe('bun scripts/weekly-model-sync.mjs');
  });

  it('uses Bun for weekly sync validation and health sub-steps', () => {
    const weeklySyncSource = fs.readFileSync(WEEKLY_SYNC_PATH, 'utf8');

    expect(weeklySyncSource).not.toContain("runStepFn('Validate model catalogs', 'node'");
    expect(weeklySyncSource).not.toContain("runStepFn('Run health checks', 'node'");
    expect(weeklySyncSource).toContain("runStepFn('Validate model catalogs', 'bun'");
    expect(weeklySyncSource).toContain("runStepFn('Run health checks', 'bun'");
  });

  it('uses the shared weekly sync entrypoint from GitHub Actions instead of inline node orchestration', () => {
    const workflowSource = fs.readFileSync(MODEL_SYNC_WORKFLOW_PATH, 'utf8');

    expect(workflowSource).toContain('bun run models:sync -- --dry-run');
    expect(workflowSource).not.toContain('const { DiscoveryEngine }');
    expect(workflowSource).not.toContain('const { PRGenerator }');
    expect(workflowSource).not.toContain('gh pr create --title');
  });
});

describe('model-management automation end-to-end coverage', () => {
  let tempDir;
  let catalogPath;
  let snapshotStore;
  let assessor;
  let lifecycle;
  let prGenerator;

  beforeEach(async () => {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'model-management-automation-'));
    catalogPath = path.join(tempDir, 'catalog-2026.json');
    await fsPromises.writeFile(catalogPath, JSON.stringify(createCatalogFixture(), null, 2));

    snapshotStore = new SnapshotStore({ storagePath: path.join(tempDir, 'snapshots') });
    await snapshotStore.save('baseline', [
      makeModel({
        id: 'openai/gpt-4',
        provider: 'openai',
        displayName: 'GPT-4',
        contextTokens: 8192,
        outputTokens: 2048
      })
    ], { metadata: { discoveryDuration: 1 } });

    assessor = new ModelAssessor({ dbPath: path.join(tempDir, 'assessments.db'), timeout: 60_000 });
    assessor.runBenchmark = mock(async (_model, benchmarkType) => {
      if (benchmarkType === 'latency') {
        return {
          avgMs: 850,
          p50: 820,
          p95: 940,
          p99: 990,
          samples: [800, 820, 850, 880, 900]
        };
      }

      return {
        score: 0.84,
        passed: 8,
        total: 10,
        details: []
      };
    });

    lifecycle = new StateMachine({ dbPath: path.join(tempDir, 'lifecycle.db') });
    prGenerator = new PRGenerator({
      catalogPath,
      repoPath: ROOT,
      baseBranch: 'main'
    });
  });

  afterEach(async () => {
    if (assessor) {
      assessor.close();
      assessor = null;
    }

    if (lifecycle) {
      lifecycle.close();
      lifecycle = null;
    }

    await fsPromises.rm(tempDir, { recursive: true, force: true });
  });

  test('runs the surfaced automation cycle through diff, assessment, lifecycle, catalog payload, and PR metadata', async () => {
    const { runModelManagementCycle } = require('../packages/opencode-model-manager/src/automation/model-management-runner');

    const result = await runModelManagementCycle({
      providers: ['openai', 'google'],
      adapters: {
        openai: makeMockAdapter([
          makeModel({
            id: 'openai/gpt-4',
            provider: 'openai',
            displayName: 'GPT-4 Turbo',
            contextTokens: 32768,
            outputTokens: 4096
          })
        ]),
        google: makeMockAdapter([
          makeModel({
            id: 'google/gemini-3-pro',
            provider: 'google',
            displayName: 'Gemini 3 Pro',
            contextTokens: 1000000,
            outputTokens: 64000,
            capabilities: { vision: true }
          })
        ]),
        groq: makeMockAdapter([]),
        cerebras: makeMockAdapter([]),
        nvidia: makeMockAdapter([])
      },
      snapshotStore,
      assessor,
      stateMachine: lifecycle,
      prGenerator,
      catalogPath,
      dryRun: true,
      generatePrMetadata: true
    });

    expect(result.discovery.models).toHaveLength(2);
    expect(result.diff.added).toHaveLength(1);
    expect(result.diff.modified).toHaveLength(1);
    expect(result.assessments).toHaveLength(2);
    expect(await lifecycle.getState('openai/gpt-4')).toBe(LIFECYCLE_STATES.ASSESSED);
    expect(await lifecycle.getState('google/gemini-3-pro')).toBe(LIFECYCLE_STATES.ASSESSED);
    expect(result.approvalSummary).toBeDefined();
    expect(result.catalogUpdatePayload).toBeDefined();
    expect(Array.isArray(result.catalogUpdatePayload.models)).toBe(false);
    expect(result.catalogUpdatePayload.models['google/gemini-3-pro']).toBeDefined();
    expect(result.prMetadata).toMatchObject({
      title: expect.any(String),
      body: expect.any(String)
    });

    const catalogAfter = JSON.parse(await fsPromises.readFile(catalogPath, 'utf8'));
    expect(Array.isArray(catalogAfter.models)).toBe(false);
    expect(catalogAfter.models['google/gemini-3-pro']).toBeUndefined();
  });

  test('weekly model sync invokes the automation flow and returns its summary', async () => {
    const { runWeeklyModelSync } = await import('../scripts/weekly-model-sync.mjs');

    const result = await runWeeklyModelSync({
      runStep: mock(() => undefined),
      checkSchemaAge: mock(() => undefined),
      runCycle: mock(async () => ({
        providers: ['openai', 'google'],
        discovery: { models: [{ id: 'openai/gpt-5' }] },
        diff: {
          added: [{ model: { id: 'openai/gpt-5' } }],
          modified: [],
          removed: []
        },
        assessments: [{ modelId: 'openai/gpt-5' }],
        approvalSummary: {
          assessedCount: 1,
          autoApproved: 1,
          manualReview: 0,
          blocked: 0
        },
        catalogUpdatePrepared: true
      }))
    });

    expect(result.summary.providerCoverage).toEqual(['openai', 'google']);
    expect(result.summary.discoveredCount).toBe(1);
    expect(result.summary.addedCount).toBe(1);
    expect(result.summary.catalogUpdatePrepared).toBe(true);
  });

  test('does not mark catalog updates prepared when discovery produces no diff', async () => {
    const { runModelManagementCycle } = require('../packages/opencode-model-manager/src/automation/model-management-runner');

    const result = await runModelManagementCycle({
      providers: ['openai'],
      adapters: {
        openai: makeMockAdapter([
          makeModel({
            id: 'openai/gpt-4',
            provider: 'openai',
            displayName: 'GPT-4',
            contextTokens: 8192,
            outputTokens: 2048
          })
        ]),
        google: makeMockAdapter([]),
        groq: makeMockAdapter([]),
        cerebras: makeMockAdapter([]),
        nvidia: makeMockAdapter([])
      },
      snapshotStore,
      assessor,
      stateMachine: lifecycle,
      prGenerator,
      catalogPath,
      dryRun: true,
      generatePrMetadata: true
    });

    expect(result.diff.added).toHaveLength(0);
    expect(result.diff.modified).toHaveLength(0);
    expect(result.diff.removed).toHaveLength(0);
    expect(result.assessments).toHaveLength(0);
    expect(result.catalogUpdatePrepared).toBe(false);
  });
});
