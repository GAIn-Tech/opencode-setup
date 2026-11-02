/**
 * Verifier Agent — Dedicated code output verification (PEV Verifier role).
 *
 * Implements the Verifier interface from opencode-pev-contract.
 *
 * Verification methods:
 * - verifyTests(result) — run test suite, assert pass
 * - verifyStatic(result) — lint, type check, AST analysis
 * - verifyLLM(result, plan) — LLM-as-judge verification
 *
 * Returns Verification: { passed, failures, confidence }
 *
 * @module opencode-verifier-agent
 */

import { Verifier, Verification } from '../../opencode-pev-contract/src/index.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Default verification policy.
 */
const DEFAULT_POLICY = Object.freeze({
  when: 'on-failure', // 'always' | 'on-failure' | 'on-high-impact'
  methods: ['tests', 'static'],
  max_retries: 3,
  escalation: 'human', // 'human' | 'auto-fix'
  test_command: 'bun test',
  lint_command: 'bunx eslint --max-warnings=0',
  timeout_ms: 60000
});

/**
 * CodeVerifier — Implements PEV Verifier interface for code verification.
 *
 * @extends {Verifier}
 */
class CodeVerifier extends Verifier {
  /**
   * @param {object} [options]
   * @param {string} [options.workDir] - Working directory for test/lint commands
   * @param {object} [options.policy] - Verification policy overrides
   */
  constructor(options = {}) {
    super();
    this.workDir = options.workDir || process.cwd();
    this.policy = { ...DEFAULT_POLICY, ...(options.policy || {}) };
  }

  /**
   * Verify a result against its plan.
   *
   * @param {object} result - Result from Executor
   * @param {object} plan - Original Plan
   * @returns {Promise<Verification>}
   */
  async verify(result, plan) {
    const methods = this._selectMethods(result, plan);
    const failures = [];
    let passed = true;
    let confidence = 1.0;

    for (const method of methods) {
      try {
        const methodResult = await this._runMethod(method, result, plan);
        if (!methodResult.passed) {
          passed = false;
          failures.push(...methodResult.failures);
          confidence -= methodResult.confidencePenalty;
        }
      } catch (err) {
        passed = false;
        failures.push(`${method}: ${err.message}`);
        confidence -= 0.2;
      }
    }

    confidence = Math.max(0, Math.min(1, confidence));

    return new Verification({
      taskId: result.taskId,
      planId: result.planId,
      passed,
      methods,
      confidence,
      failures,
      details: {
        methodsRun: methods,
        resultSuccess: result.success,
        planSteps: plan.steps?.length || 0
      }
    });
  }

  /**
   * Select verification methods based on policy and context.
   * @private
   */
  _selectMethods(result, plan) {
    const { when } = this.policy;

    if (when === 'always') {
      return [...this.policy.methods];
    }

    if (when === 'on-failure' && !result.success) {
      return [...this.policy.methods];
    }

    if (when === 'on-high-impact') {
      const isHighImpact = plan.metadata?.complexity === 'high' ||
        plan.metadata?.filesModified >= 10 ||
        plan.steps?.some(s => s.type === 'deploy' || s.type === 'migration');
      if (isHighImpact) {
        return [...this.policy.methods];
      }
    }

    // Default: minimal verification
    return ['static'];
  }

  /**
   * Run a specific verification method.
   * @private
   */
  async _runMethod(method, result, plan) {
    switch (method) {
      case 'tests':
        return this.verifyTests(result);
      case 'static':
        return this.verifyStatic(result);
      case 'llm':
        return this.verifyLLM(result, plan);
      default:
        return { passed: true, failures: [], confidencePenalty: 0 };
    }
  }

  /**
   * Run test suite and assert pass.
   *
   * @param {object} result - Execution result
   * @returns {Promise<{passed: boolean, failures: string[], confidencePenalty: number}>}
   */
  async verifyTests(result) {
    const command = this.policy.test_command;
    const failures = [];

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workDir,
        timeout: this.policy.timeout_ms
      });

      // Check for test failures in output
      const hasFailures = stdout.includes('fail') || stderr.includes('fail');
      const hasErrors = stdout.includes('error') || stderr.includes('error');

      if (hasFailures || hasErrors) {
        failures.push(`Test suite reported issues:\n${stdout}\n${stderr}`);
      }

      return {
        passed: failures.length === 0,
        failures,
        confidencePenalty: failures.length > 0 ? 0.3 : 0
      };
    } catch (err) {
      failures.push(`Test execution failed: ${err.message}`);
      if (err.stdout) failures.push(err.stdout);
      if (err.stderr) failures.push(err.stderr);

      return {
        passed: false,
        failures,
        confidencePenalty: 0.3
      };
    }
  }

  /**
   * Run static analysis (lint, type check).
   *
   * @param {object} result - Execution result
   * @returns {Promise<{passed: boolean, failures: string[], confidencePenalty: number}>}
   */
  async verifyStatic(result) {
    const command = this.policy.lint_command;
    const failures = [];

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workDir,
        timeout: this.policy.timeout_ms
      });

      if (stderr && !stderr.includes('0 warnings')) {
        failures.push(`Lint reported:\n${stderr}`);
      }

      return {
        passed: failures.length === 0,
        failures,
        confidencePenalty: failures.length > 0 ? 0.2 : 0
      };
    } catch (err) {
      failures.push(`Static analysis failed: ${err.message}`);
      if (err.stdout) failures.push(err.stdout);
      if (err.stderr) failures.push(err.stderr);

      return {
        passed: false,
        failures,
        confidencePenalty: 0.2
      };
    }
  }

  /**
   * LLM-as-judge verification.
   *
   * @param {object} result - Execution result
   * @param {object} plan - Original plan
   * @returns {Promise<{passed: boolean, failures: string[], confidencePenalty: number}>}
   */
  async verifyLLM(result, plan) {
    // Placeholder: In production, this would call an LLM to verify the result
    // For now, return a basic structural check
    const failures = [];

    if (!result.outputs || Object.keys(result.outputs).length === 0) {
      failures.push('No outputs produced');
    }

    if (result.error) {
      failures.push(`Execution error: ${result.error}`);
    }

    return {
      passed: failures.length === 0,
      failures,
      confidencePenalty: failures.length > 0 ? 0.25 : 0
    };
  }

  /**
   * Update verification policy.
   *
   * @param {object} policyOverrides - Policy overrides
   */
  setPolicy(policyOverrides) {
    this.policy = { ...this.policy, ...policyOverrides };
  }

  /**
   * Get current policy.
   *
   * @returns {object}
   */
  getPolicy() {
    return { ...this.policy };
  }
}

export { CodeVerifier, DEFAULT_POLICY };
export default CodeVerifier;
