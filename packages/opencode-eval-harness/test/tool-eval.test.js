import { describe, test, expect } from 'bun:test';
import { Harness } from '../src/index.js';

describe('Eval-Driven Tool Optimization', () => {
  describe('evaluateTool', () => {
    test('evaluates a tool with all passing cases', async () => {
      const harness = new Harness();
      const testCases = [
        { input: 'hello', expectedOutput: 'HELLO', expectedTokens: 5 },
        { input: 'world', expectedOutput: 'WORLD', expectedTokens: 5 },
      ];
      const executor = async (toolName, input) => ({
        output: input.toUpperCase(),
        tokensUsed: input.length,
      });

      const result = await harness.evaluateTool('uppercase_tool', testCases, executor);

      expect(result.tool_name).toBe('uppercase_tool');
      expect(result.success_rate).toBe(1.0);
      expect(result.error_rate).toBe(0);
      expect(result.confusion_rate).toBe(0);
      expect(result.tests_total).toBe(2);
      expect(result.tests_passed).toBe(2);
      expect(result.avg_tokens).toBe(5);
    });

    test('detects tool errors', async () => {
      const harness = new Harness();
      const testCases = [
        { input: 'ok', expectedOutput: 'OK' },
        { input: 'fail', expectedOutput: 'FAIL' },
      ];
      let callCount = 0;
      const executor = async (toolName, input) => {
        callCount++;
        if (input === 'fail') throw new Error('Tool execution failed');
        return { output: input.toUpperCase(), tokensUsed: input.length };
      };

      const result = await harness.evaluateTool('flaky_tool', testCases, executor);

      expect(result.success_rate).toBe(0.5);
      expect(result.error_rate).toBe(0.5);
      expect(result.tests_passed).toBe(1);
      expect(result.tests_total).toBe(2);
    });

    test('detects confusion (excessive token usage)', async () => {
      const harness = new Harness();
      const testCases = [
        { input: 'short', expectedOutput: 'SHORT', expectedTokens: 5 },
        { input: 'long', expectedOutput: 'LONG', expectedTokens: 4 },
      ];
      const executor = async (toolName, input) => ({
        output: input.toUpperCase(),
        tokensUsed: input === 'short' ? 5 : 50, // second case uses 10x expected
      });

      const result = await harness.evaluateTool('confusing_tool', testCases, executor);

      expect(result.confusion_rate).toBe(0.5);
      expect(result.success_rate).toBe(1.0); // outputs still correct
    });

    test('handles empty test suite', async () => {
      const harness = new Harness();
      const result = await harness.evaluateTool('empty_tool', [], async () => ({}));

      expect(result.tool_name).toBe('empty_tool');
      expect(result.success_rate).toBe(0);
      expect(result.tests_total).toBe(0);
    });

    test('tracks latency percentiles', async () => {
      const harness = new Harness();
      const testCases = Array(10).fill({ input: 'x', expectedOutput: 'X' });
      const executor = async () => ({ output: 'X', tokensUsed: 1 });

      const result = await harness.evaluateTool('latency_tool', testCases, executor);

      expect(result.latency_p50_ms).toBeDefined();
      expect(result.latency_p95_ms).toBeDefined();
      expect(result.latency_p95_ms).toBeGreaterThanOrEqual(result.latency_p50_ms);
    });
  });
});
