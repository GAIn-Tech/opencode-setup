/**
 * @jest-environment node
 */

const { Orchestrator } = require('../src/strategies/orchestrator.js');
const { ModelRouter } = require('../src/index.js');
const { IntelligentRotator } = require('../src/key-rotator.js');
const { KeyRotatorFactory } = require('../src/key-rotator-factory.js');

// Mock dependencies
jest.mock('../src/key-rotator.js');
jest.mock('../src/key-rotator-factory.js');

describe('Orchestrator', () => {
  let orchestrator;
  let mockFallbackLayer;
  let mockProjectStart;
  let mockManualOverride;
  let mockStuckBug;
  let mockPerspectiveSwitch;
  let mockReversion;

  beforeEach(() => {
    // Reset mock context
    const GlobalModelContext = {
      sessionId: 'test-session',
      globalOverride: null,
      setOverride: jest.fn(),
      clearOverride: jest.fn(),
      resetSession: jest.fn()
    };

    // Create strategy mocks
    mockFallbackLayer = {
      getPriority: () => 100,
      select: jest.fn(() => ({ provider: 'groq', model: 'llama-3.1-70b', reasoning: null }))
    };

    mockProjectStart = {
      getPriority: () => 200,
      select: jest.fn(() => ({ provider: 'anthropic', model: 'claude-3.5-sonnet-20240620', reasoning: 'minimal' }))
    };

    mockManualOverride = {
      getPriority: () => 300,
      select: jest.fn(() => ({ provider: 'openai', model: 'gpt-4o', reasoning: null }))
    };

    mockStuckBug = {
      getPriority: () => 250,
      select: jest.fn(() => ({ provider: 'anthropic', model: 'claude-3.5-sonnet-20240620', reasoning: 'high' }))
    };

    mockPerspectiveSwitch = {
      getPriority: () => 260,
      select: jest.fn(() => ({ provider: 'google', model: 'gemini-2.0-flash-exp', reasoning: 'minimal' }))
    };

    mockReversion = {
      getPriority: () => 270,
      select: jest.fn(() => ({ provider: 'groq', model: 'llama-3.1-70b', reasoning: null }))
    };

    orchestrator = new Orchestrator({
      strategies: [
        mockFallbackLayer,
        mockProjectStart,
        mockManualOverride,
        mockStuckBug,
        mockPerspectiveSwitch,
        mockReversion
      ],
      globalContext: GlobalModelContext
    });
  });

  test('should initialize with strategies in priority order', () => {
    expect(orchestrator.strategies.length).toBe(6);
    expect(orchestrator.strategies[0].getPriority()).toBe(300);
    expect(orchestrator.strategies[5].getPriority()).toBe(100);
  });

  test('should execute strategies in priority order and return first successful selection', async () => {
    const context = {
      task: {
        type: 'code_generation',
        input: "function add(a, b) { return a + b; }",
        signals: {
          complexity: 'low',
          budget: 'low',
          timeConstraint: false
        },
        sessionId: 'test-session-123'
      },
      history: [],
      state: {
        isProjectStart: false,
        stuckBug: null
      },
      timestamp: Date.now()
    };

    const result = orchestrator.orchestrate(context);

    expect(result).toBeDefined();
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-4o');
  });

  test('should fall back to lower priority strategies when higher ones return null', async () => {
    // Simulate higher priority strategies returning null
    mockManualOverride.select.mockReturnValue(null);
    mockStuckBug.select.mockReturnValue(null);
    mockPerspectiveSwitch.select.mockReturnValue(null);
    mockReversion.select.mockReturnValue(null);
    mockProjectStart.select.mockReturnValue(null);

    const context = {
      task: {
        type: 'code_generation',
        input: "function add(a, b) { return a + b; }",
        signals: {
          complexity: 'low',
          budget: 'low',
          timeConstraint: false
        },
        sessionId: 'test-session-123'
      },
      history: [],
      state: {
        isProjectStart: false,
        stuckBug: null
      },
      timestamp: Date.now()
    };

    const result = orchestrator.orchestrate(context);

    expect(result).toBeDefined();
    expect(result.provider).toBe('groq');
    expect(result).toEqual({
      provider: 'groq',
      model: 'llama-3.1-70b',
      reasoning: null
    });
  });

  test('should handle context without task', async () => {
    const context = {};

    const result = orchestrator.orchestrate(context);

    expect(result).toBeDefined();
  });
});

describe('ModelRouter with Orchestrator Integration', () => {
  let router;
  let orchestrator;
  let mockRotators;

  beforeEach(() => {
    // Set up environment variables for testing
    process.env.NVIDIA_API_KEYS = 'test-key-1,test-key-2';
    process.env.GROQ_API_KEYS = 'test-key-3,test-key-4';
    process.env.CEREBRAS_API_KEYS = 'test-key-5,test-key-6';
    process.env.GOOGLE_API_KEY = 'test-key-7';
    process.env.ANTHROPIC_API_KEY = 'test-key-8';
    process.env.OPENAI_API_KEY = 'test-key-9';

    // Mock rotators
    mockRotators = {
      nvidia: new IntelligentRotator('nvidia', ['test-key-1', 'test-key-2']),
      groq: new IntelligentRotator('groq', ['test-key-3', 'test-key-4']),
      cerebras: new IntelligentRotator('cerebras', ['test-key-5', 'test-key-6']),
      antigravity: new IntelligentRotator('antigravity', ['test-key-7']),
      anthropic: new IntelligentRotator('anthropic', ['test-key-8']),
      openai: new IntelligentRotator('openai', ['test-key-9'])
    };

    KeyRotatorFactory.createFromEnv.mockReturnValue(mockRotators);

    // Mock GlobalModelContext
    const GlobalModelContext = function() {
      this.sessionId = 'test-session-' + Math.random().toString(36).substring(7);
      this.globalOverride = null;
      this.setOverride = jest.fn();
      this.clearOverride = jest.fn();
      this.resetSession = jest.fn();
      this.getProjectStartOverride = jest.fn();
      this.checkForStuckBugs = jest.fn();
    };

    orchestrator = new Orchestrator({
      globalContext: new GlobalModelContext()
    });

    router = new ModelRouter({
      rotators: mockRotators,
      orchestrator,
      baseCosts: {
        groq: { 'llama-3.1-70b': 0.0001 },
        cerebras: { 'llama-3.1-70b': 0.0002 }
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should route using Orchestrator selection', async () => {
    const context = {
      task: {
        type: 'code_generation',
        input: "function add(a, b) { return a + b; }",
        signals: {
          complexity: 'low',
          budget: 'low',
          timeConstraint: false
        },
        sessionId: 'test-session-123'  
      },
      history: [],
      state: {
        isProjectStart: false,
        stuckBug: null
      },
      timestamp: Date.now()
    };

    const selection = orchestrator.orchestrate(context);

    const apiKey = router.getApiKeyForModel({
      provider: selection.provider,
      model: selection.model,
      reasoning: selection.reasoning
    });

    expect(apiKey).toBeDefined();
    expect(typeof apiKey).toBe('string');
  });

  test('should fallback to scoring when Orchestrator has no override', () => {
    const result = router.route({
      taskType: 'code_generation',
      maxBudget: 0.01
    });

    expect(result).toBeDefined();
    expect(result).toHaveProperty('provider');
    expect(result).toHaveProperty('model');
  });

  test('should throw error when no model available', () => {
    expect(() => {
      router.route({
        taskType: 'code_generation',
        maxBudget: 0.0001 // Unrealistically low budget
      });
    }).toThrow('No model available for the given constraints');
  });
});

describe('Strategy Priority', () => {
  test('strategies should be executed in correct priority order', () => {
    const executionOrder = [];
    const mockStrategies = [
      { getPriority: () => 100, select: jest.fn(() => null) },
      { getPriority: () => 300, select: jest.fn(() => ({ provider: 'test', model: 'test' })) },
      { getPriority: () => 200, select: jest.fn(() => ({ provider: 'test', model: 'test' })) }
    ];

    // Inject tracking into each strategy
    mockStrategies.forEach((s, i) => {
      const originalSelect = s.select;
      s.select = (ctx) => {
        executionOrder.push(s.getPriority());
        return originalSelect(ctx);
      };
    });

    const orchestrator = new Orchestrator({ strategies: mockStrategies });

    // Execute orchestration
    orchestrator.orchestrate({});

    // Verify execution order is highest to lowest
    expect(executionOrder).toEqual([300, 200, 100]);
  });
});
