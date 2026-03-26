'use strict';

const { describe, test, expect, beforeEach } = require('bun:test');
const { SkillBank } = require('../src/skill-bank');
const { SkillRLManager } = require('../src/index');
const path = require('path');
const os = require('os');
const fs = require('fs');

const REGISTRY_PATH = path.resolve(__dirname, '../../../opencode-config/skills/registry.json');

/**
 * Performance Benchmarks for opencode-skill-rl-manager
 * 
 * Tests verify that core operations complete within acceptable time bounds
 * when operating at full 92-skill registry scale.
 */

describe('Performance: _matchesContext()', () => {
  let skillBank;
  let allSkills;

  beforeEach(() => {
    // Create a SkillBank and sync from real registry (92 skills)
    const manager = new SkillRLManager({
      stateFile: path.join(os.tmpdir(), `perf-test-${Date.now()}.json`)
    });
    skillBank = manager.skillBank;
    allSkills = Array.from(skillBank.generalSkills.values());
  });

  test('100 iterations against 92 skills: average < 1ms per iteration', () => {
    expect(allSkills.length).toBeGreaterThanOrEqual(92);

    const taskContext = {
      task_type: 'implementation',
      complexity: 'high',
      error_type: null,
      description: 'fix and deploy the new kubernetes service with tests'
    };

    // JIT warmup pass
    for (let i = 0; i < 10; i++) {
      skillBank._matchesContext(allSkills[i % allSkills.length], taskContext);
    }

    // Timed run: 100 iterations, each checking ALL skills
    const times = [];
    for (let iter = 0; iter < 100; iter++) {
      const start = performance.now();
      for (const skill of allSkills) {
        skillBank._matchesContext(skill, taskContext);
      }
      times.push(performance.now() - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    // Each full pass over 92 skills must average < 1ms
    expect(avg).toBeLessThan(1);
  });
});

describe('Performance: querySkills()', () => {
  let manager;

  beforeEach(() => {
    manager = new SkillRLManager({
      stateFile: path.join(os.tmpdir(), `perf-query-${Date.now()}.json`)
    });
  });

  test('100 iterations: average < 5ms per call', () => {
    const taskContext = {
      task_type: 'debugging',
      complexity: 'high',
      error_type: 'null pointer',
      description: 'debug null pointer exception in handler'
    };

    // JIT warmup
    for (let i = 0; i < 5; i++) {
      manager.skillBank.querySkills(taskContext);
    }

    const times = [];
    for (let iter = 0; iter < 100; iter++) {
      const start = performance.now();
      manager.skillBank.querySkills(taskContext);
      times.push(performance.now() - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    expect(avg).toBeLessThan(5);
  });
});

describe('Performance: selectSkills()', () => {
  let manager;

  beforeEach(() => {
    manager = new SkillRLManager({
      stateFile: path.join(os.tmpdir(), `perf-select-${Date.now()}.json`)
    });
  });

  test('100 iterations: average < 10ms per call', () => {
    const taskContext = {
      task_type: 'debugging',
      complexity: 'high',
      error_type: 'null pointer',
      description: 'debug null pointer exception in handler'
    };

    // JIT warmup
    for (let i = 0; i < 5; i++) {
      manager.selectSkills(taskContext);
    }

    const times = [];
    for (let iter = 0; iter < 100; iter++) {
      const start = performance.now();
      manager.selectSkills(taskContext);
      times.push(performance.now() - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    expect(avg).toBeLessThan(10);
  });
});

describe('Performance: syncWithRegistry()', () => {
  test('10 iterations: average < 100ms per call', () => {
    // JIT warmup
    for (let i = 0; i < 2; i++) {
      const m = new SkillRLManager({
        stateFile: path.join(os.tmpdir(), `perf-sync-warmup-${Date.now()}-${i}.json`)
      });
      m.syncWithRegistry(REGISTRY_PATH);
    }

    const times = [];
    for (let iter = 0; iter < 10; iter++) {
      const m = new SkillRLManager({
        stateFile: path.join(os.tmpdir(), `perf-sync-${Date.now()}-${iter}.json`)
      });
      // Clear skills to force full import (not just merge)
      m.skillBank.generalSkills.clear();
      m.skillBank._invalidateCache();

      const start = performance.now();
      m.syncWithRegistry(REGISTRY_PATH);
      times.push(performance.now() - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    expect(avg).toBeLessThan(100);
  });
});

/**
 * Semantic Matching Gap Verification
 * 
 * Verifies that natural-language task descriptions correctly match skills
 * from the appropriate category via synonym expansion, domain signals,
 * or application_context keyword matching.
 */
describe('Semantic matching gap verification', () => {
  let manager;
  let skillBank;

  beforeEach(() => {
    manager = new SkillRLManager({
      stateFile: path.join(os.tmpdir(), `semantic-gap-${Date.now()}.json`)
    });
    skillBank = manager.skillBank;
  });

  test('"fix intermittent test failures" matches a debugging-category skill', () => {
    const taskContext = {
      description: 'fix intermittent test failures'
    };

    // Get all debugging-category skills from registry
    const debuggingSkills = Array.from(skillBank.generalSkills.values())
      .filter(s => s.category === 'debugging');

    expect(debuggingSkills.length).toBeGreaterThan(0);

    // At least one debugging skill must match via semantic expansion
    // ('fix' → synonym → 'debugging' canonical → matches tag 'debugging')
    const anyMatch = debuggingSkills.some(skill =>
      skillBank._matchesContext(skill, taskContext)
    );
    expect(anyMatch).toBe(true);
  });

  test('"deploy application to kubernetes cluster" matches a devops-category skill', () => {
    const taskContext = {
      description: 'deploy application to kubernetes cluster'
    };

    // Get all devops-category skills
    const devopsSkills = Array.from(skillBank.generalSkills.values())
      .filter(s => s.category === 'devops');

    expect(devopsSkills.length).toBeGreaterThan(0);

    // At least one devops skill must match
    // ('kubernetes' keyword in application_context of kubernetes-orchestration)
    const anyMatch = devopsSkills.some(skill =>
      skillBank._matchesContext(skill, taskContext)
    );
    expect(anyMatch).toBe(true);
  });

  test('"optimize database query performance" matches a database-category skill', () => {
    const taskContext = {
      description: 'optimize database query performance'
    };

    // Get all database-category skills
    const dbSkills = Array.from(skillBank.generalSkills.values())
      .filter(s => s.category === 'database');

    expect(dbSkills.length).toBeGreaterThan(0);

    // At least one database skill must match
    // ('optimize' → domain signal → 'optimization' → tag 'optimization' on postgresql-optimization)
    const anyMatch = dbSkills.some(skill =>
      skillBank._matchesContext(skill, taskContext)
    );
    expect(anyMatch).toBe(true);
  });

  test('"write unit tests for authentication module" matches a testing-category skill', () => {
    const taskContext = {
      description: 'write unit tests for authentication module'
    };

    // Get all testing-category skills
    const testingSkills = Array.from(skillBank.generalSkills.values())
      .filter(s => s.category === 'testing');

    expect(testingSkills.length).toBeGreaterThan(0);

    // At least one testing skill must match
    // ('tests' keyword in application_context of test-driven-development)
    const anyMatch = testingSkills.some(skill =>
      skillBank._matchesContext(skill, taskContext)
    );
    expect(anyMatch).toBe(true);
  });

  test('"refactor legacy codebase to clean architecture" matches an architecture-category skill', () => {
    const taskContext = {
      description: 'refactor legacy codebase to clean architecture'
    };

    // Get all architecture-category skills
    const archSkills = Array.from(skillBank.generalSkills.values())
      .filter(s => s.category === 'architecture');

    expect(archSkills.length).toBeGreaterThan(0);

    // At least one architecture skill must match
    // ('legacy' keyword in application_context of clean-architecture)
    const anyMatch = archSkills.some(skill =>
      skillBank._matchesContext(skill, taskContext)
    );
    expect(anyMatch).toBe(true);
  });
});
