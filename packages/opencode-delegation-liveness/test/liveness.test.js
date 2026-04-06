'use strict';

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const {
  TASK_STATES,
  PROGRESS_SIGNALS,
  CATEGORY_TIMEOUTS,
  SLOW_THRESHOLDS,
  ProgressTracker,
  LivenessDetector,
  classifyTaskState
} = require('../src/index.js');

describe('Delegation Liveness Detection', () => {
  
  describe('TASK_STATES constants', () => {
    test('defines all required states', () => {
      expect(TASK_STATES.HEALTHY).toBe('healthy');
      expect(TASK_STATES.SLOW).toBe('slow');
      expect(TASK_STATES.STALLED).toBe('stalled');
      expect(TASK_STATES.FAILED).toBe('failed');
      expect(TASK_STATES.WAITING_ON_HUMAN).toBe('waiting-on-human');
      expect(TASK_STATES.UNKNOWN).toBe('unknown');
    });
  });

  describe('PROGRESS_SIGNALS constants', () => {
    test('defines all required signal types', () => {
      expect(PROGRESS_SIGNALS.TOOL_INVOCATION).toBe('tool-invocation');
      expect(PROGRESS_SIGNALS.FILE_READ).toBe('file-read');
      expect(PROGRESS_SIGNALS.FILE_WRITE).toBe('file-write');
      expect(PROGRESS_SIGNALS.BASH_COMMAND).toBe('bash-command');
      expect(PROGRESS_SIGNALS.HEARTBEAT).toBe('heartbeat');
      expect(PROGRESS_SIGNALS.ERROR).toBe('error');
      expect(PROGRESS_SIGNALS.HUMAN_INPUT_REQUIRED).toBe('human-input-required');
    });
  });

  describe('CATEGORY_TIMEOUTS', () => {
    test('defines timeouts for all categories', () => {
      expect(CATEGORY_TIMEOUTS.quick).toBeDefined();
      expect(CATEGORY_TIMEOUTS.deep).toBeDefined();
      expect(CATEGORY_TIMEOUTS.ultrabrain).toBeDefined();
      expect(CATEGORY_TIMEOUTS['visual-engineering']).toBeDefined();
    });

    test('quick has shorter timeout than deep', () => {
      expect(CATEGORY_TIMEOUTS.quick).toBeLessThan(CATEGORY_TIMEOUTS.deep);
    });

    test('deep has shorter timeout than ultrabrain', () => {
      expect(CATEGORY_TIMEOUTS.deep).toBeLessThan(CATEGORY_TIMEOUTS.ultrabrain);
    });
  });

  describe('ProgressTracker', () => {
    test('creates tracker with default options', () => {
      const tracker = new ProgressTracker();
      expect(tracker.taskId).toBeDefined();
      expect(tracker.category).toBe('default');
      expect(tracker.state).toBe(TASK_STATES.HEALTHY);
    });

    test('creates tracker with custom options', () => {
      const tracker = new ProgressTracker({
        taskId: 'test-task-123',
        category: 'deep'
      });
      expect(tracker.taskId).toBe('test-task-123');
      expect(tracker.category).toBe('deep');
    });

    test('records progress signals', () => {
      const tracker = new ProgressTracker({ category: 'quick' });
      const signal = tracker.recordProgress(PROGRESS_SIGNALS.TOOL_INVOCATION, { tool: 'read' });
      
      expect(signal.type).toBe(PROGRESS_SIGNALS.TOOL_INVOCATION);
      expect(signal.timestamp).toBeDefined();
      expect(tracker.signals.length).toBe(1);
    });

    test('updates lastProgressAt on progress', () => {
      const tracker = new ProgressTracker({ category: 'quick' });
      const initialProgress = tracker.lastProgressAt;
      
      // Wait a tiny bit
      const now = Date.now();
      tracker.recordProgress(PROGRESS_SIGNALS.HEARTBEAT);
      
      expect(tracker.lastProgressAt).toBeGreaterThanOrEqual(initialProgress);
    });

    test('evaluates healthy state with recent progress', () => {
      const tracker = new ProgressTracker({ category: 'quick' });
      tracker.recordProgress(PROGRESS_SIGNALS.TOOL_INVOCATION);
      
      const result = tracker.evaluateState();
      expect(result.state).toBe(TASK_STATES.HEALTHY);
    });

    test('evaluates failed state on error signal', () => {
      const tracker = new ProgressTracker({ category: 'quick' });
      tracker.recordProgress(PROGRESS_SIGNALS.ERROR, { message: 'test error' });
      
      const result = tracker.evaluateState();
      expect(result.state).toBe(TASK_STATES.FAILED);
      expect(result.reason).toBe('error-signal');
    });

    test('evaluates waiting-on-human state', () => {
      const tracker = new ProgressTracker({ category: 'quick' });
      tracker.recordProgress(PROGRESS_SIGNALS.HUMAN_INPUT_REQUIRED);
      
      const result = tracker.evaluateState();
      expect(result.state).toBe(TASK_STATES.WAITING_ON_HUMAN);
    });

    test('getSummary returns task summary', () => {
      const tracker = new ProgressTracker({
        taskId: 'test-123',
        category: 'deep'
      });
      tracker.recordProgress(PROGRESS_SIGNALS.FILE_READ);
      
      const summary = tracker.getSummary();
      expect(summary.taskId).toBe('test-123');
      expect(summary.category).toBe('deep');
      expect(summary.signalCount).toBe(1);
    });
  });

  describe('LivenessDetector', () => {
    test('creates detector with empty trackers', () => {
      const detector = new LivenessDetector();
      expect(detector.trackers.size).toBe(0);
    });

    test('starts tracking a task', () => {
      const detector = new LivenessDetector();
      const tracker = detector.startTracking('task-1', { category: 'quick' });
      
      expect(tracker.taskId).toBe('task-1');
      expect(detector.trackers.size).toBe(1);
    });

    test('records progress for a task', () => {
      const detector = new LivenessDetector();
      detector.startTracking('task-1');
      
      const signal = detector.recordProgress('task-1', PROGRESS_SIGNALS.HEARTBEAT);
      expect(signal).toBeDefined();
      expect(signal.type).toBe(PROGRESS_SIGNALS.HEARTBEAT);
    });

    test('returns null for unknown task', () => {
      const detector = new LivenessDetector();
      const result = detector.recordProgress('unknown-task', PROGRESS_SIGNALS.HEARTBEAT);
      expect(result).toBeNull();
    });

    test('evaluates all tracked tasks', () => {
      const detector = new LivenessDetector();
      detector.startTracking('task-1', { category: 'quick' });
      detector.startTracking('task-2', { category: 'deep' });
      
      detector.recordProgress('task-1', PROGRESS_SIGNALS.HEARTBEAT);
      detector.recordProgress('task-2', PROGRESS_SIGNALS.TOOL_INVOCATION);
      
      const results = detector.evaluateAll();
      expect(results.length).toBe(2);
    });

    test('gets stalled tasks', () => {
      const detector = new LivenessDetector();
      detector.startTracking('task-1', { category: 'quick' });
      
      // Don't record any progress - will be stalled after timeout
      const stalled = detector.getStalledTasks();
      // Initially not stalled because timeout hasn't passed
      expect(stalled.length).toBe(0);
    });

    test('stops tracking a task', () => {
      const detector = new LivenessDetector();
      detector.startTracking('task-1');
      expect(detector.trackers.size).toBe(1);
      
      detector.stopTracking('task-1');
      expect(detector.trackers.size).toBe(0);
    });
  });

  describe('classifyTaskState', () => {
    test('classifies healthy state', () => {
      const result = classifyTaskState({
        category: 'quick',
        elapsed: 1000,
        sinceProgress: 500,
        hasError: false,
        waitingOnHuman: false
      });
      
      expect(result.state).toBe(TASK_STATES.HEALTHY);
    });

    test('classifies failed state on error', () => {
      const result = classifyTaskState({
        category: 'quick',
        elapsed: 1000,
        sinceProgress: 500,
        hasError: true,
        waitingOnHuman: false
      });
      
      expect(result.state).toBe(TASK_STATES.FAILED);
      expect(result.reason).toBe('error-signal');
    });

    test('classifies waiting-on-human state', () => {
      const result = classifyTaskState({
        category: 'quick',
        elapsed: 1000,
        sinceProgress: 500,
        hasError: false,
        waitingOnHuman: true
      });
      
      expect(result.state).toBe(TASK_STATES.WAITING_ON_HUMAN);
    });

    test('classifies stalled state when timeout exceeded', () => {
      const result = classifyTaskState({
        category: 'quick',
        elapsed: CATEGORY_TIMEOUTS.quick + 1000,
        sinceProgress: CATEGORY_TIMEOUTS.quick + 1000,
        hasError: false,
        waitingOnHuman: false
      });
      
      expect(result.state).toBe(TASK_STATES.STALLED);
      expect(result.reason).toBe('no-progress-timeout');
    });

    test('classifies slow state when approaching timeout', () => {
      const timeout = CATEGORY_TIMEOUTS.quick;
      const slowThreshold = timeout * SLOW_THRESHOLDS.quick;
      
      const result = classifyTaskState({
        category: 'quick',
        elapsed: slowThreshold + 100,
        sinceProgress: slowThreshold * 0.6,
        hasError: false,
        waitingOnHuman: false
      });
      
      expect(result.state).toBe(TASK_STATES.SLOW);
    });

    test('uses default category for unknown category', () => {
      const result = classifyTaskState({
        category: 'unknown-category',
        elapsed: 1000,
        sinceProgress: 500,
        hasError: false,
        waitingOnHuman: false
      });
      
      expect(result.state).toBe(TASK_STATES.HEALTHY);
    });
  });

  describe('Edge cases', () => {
    test('long-running quiet task is slow, not stalled, before timeout', () => {
      const timeout = CATEGORY_TIMEOUTS.deep;
      const slowThreshold = timeout * SLOW_THRESHOLDS.deep;
      
      // Task has been running for a while but within timeout
      const result = classifyTaskState({
        category: 'deep',
        elapsed: slowThreshold + 1000,
        sinceProgress: slowThreshold * 0.7, // Some progress, but slow
        hasError: false,
        waitingOnHuman: false
      });
      
      // Should be slow, not stalled
      expect(result.state).toBe(TASK_STATES.SLOW);
    });

    test('rate-limited task is not misclassified as stall', () => {
      // Simulate a task that's making progress but slowly
      const result = classifyTaskState({
        category: 'deep',
        elapsed: CATEGORY_TIMEOUTS.deep * 0.5,
        sinceProgress: CATEGORY_TIMEOUTS.deep * 0.3, // Recent progress
        hasError: false,
        waitingOnHuman: false
      });
      
      // Should be healthy because progress is recent
      expect(result.state).toBe(TASK_STATES.HEALTHY);
    });

    test('brownout scenario - intermittent progress', () => {
      // Task with intermittent progress during brownout
      const result = classifyTaskState({
        category: 'quick',
        elapsed: CATEGORY_TIMEOUTS.quick * 0.8,
        sinceProgress: CATEGORY_TIMEOUTS.quick * 0.4, // Progress but slower
        hasError: false,
        waitingOnHuman: false
      });
      
      // Should be slow but not stalled
      expect(result.state).toBe(TASK_STATES.SLOW);
    });

    test('concurrent sessions are tracked independently', () => {
      const detector = new LivenessDetector();
      
      detector.startTracking('session-1-task-1', { category: 'quick' });
      detector.startTracking('session-2-task-1', { category: 'deep' });
      
      detector.recordProgress('session-1-task-1', PROGRESS_SIGNALS.HEARTBEAT);
      // session-2-task-1 has no progress
      
      const results = detector.evaluateAll();
      const session1 = results.find(r => r.taskId === 'session-1-task-1');
      const session2 = results.find(r => r.taskId === 'session-2-task-1');
      
      expect(session1.state).toBe(TASK_STATES.HEALTHY);
      // session2 might be slow or stalled depending on timing
      expect([TASK_STATES.HEALTHY, TASK_STATES.SLOW, TASK_STATES.STALLED]).toContain(session2.state);
    });
  });

  describe('Category-specific timeout semantics', () => {
    test('quick category has shortest timeout', () => {
      const quickTimeout = CATEGORY_TIMEOUTS.quick;
      expect(quickTimeout).toBeLessThan(CATEGORY_TIMEOUTS.deep);
      expect(quickTimeout).toBeLessThan(CATEGORY_TIMEOUTS.ultrabrain);
    });

    test('ultrabrain category has longest timeout', () => {
      const ultrabrainTimeout = CATEGORY_TIMEOUTS.ultrabrain;
      expect(ultrabrainTimeout).toBeGreaterThan(CATEGORY_TIMEOUTS.deep);
      expect(ultrabrainTimeout).toBeGreaterThan(CATEGORY_TIMEOUTS.quick);
    });

    test('visual-engineering has moderate timeout', () => {
      const visualTimeout = CATEGORY_TIMEOUTS['visual-engineering'];
      expect(visualTimeout).toBeGreaterThan(CATEGORY_TIMEOUTS.quick);
      expect(visualTimeout).toBeLessThan(CATEGORY_TIMEOUTS.ultrabrain);
    });
  });
});
