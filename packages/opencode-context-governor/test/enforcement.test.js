import { describe, test, expect, beforeEach } from 'bun:test';
import { Governor, BUDGET_MODES } from '../src/index.js';

describe('Context Budget Enforcement', () => {
  let governor;

  beforeEach(() => {
    governor = new Governor({ autoLoad: false });
  });

  describe('BUDGET_MODES', () => {
    test('defines advisory and enforce-critical modes', () => {
      expect(BUDGET_MODES.ADVISORY).toBe('advisory');
      expect(BUDGET_MODES.ENFORCE_CRITICAL).toBe('enforce-critical');
    });
  });

  describe('Mode getter/setter', () => {
    test('defaults to enforce-critical mode (binding by default)', () => {
      expect(governor.getMode()).toBe('enforce-critical');
    });

    test('can switch to advisory mode', () => {
      governor.setMode('advisory');
      expect(governor.getMode()).toBe('advisory');
    });

    test('can switch back to enforce-critical mode', () => {
      governor.setMode('advisory');
      governor.setMode('enforce-critical');
      expect(governor.getMode()).toBe('enforce-critical');
    });

    test('rejects invalid mode', () => {
      expect(() => governor.setMode('invalid')).toThrow('Invalid budget mode');
    });
  });

  describe('Advisory mode (opt-in)', () => {
    test('allows requests even at error threshold', () => {
      // Switch to advisory mode explicitly
      governor.setMode('advisory');
      
      const session = 'ses-advisory-test';
      const model = 'gpt-5'; // 100,000 max, error at 80%

      // Consume 79% of budget
      governor.consumeTokens(session, model, 79000);

      // Now propose 2% more → would reach 81% (error threshold)
      const check = governor.checkBudget(session, model, 2000);
      expect(check.status).toBe('error');
      expect(check.allowed).toBe(true); // advisory mode allows it
    });

    test('denies requests that exceed max', () => {
      const session = 'ses-advisory-exceed';
      const model = 'gpt-5';

      governor.consumeTokens(session, model, 99000);

      const check = governor.checkBudget(session, model, 2000);
      expect(check.status).toBe('exceeded');
      expect(check.allowed).toBe(false);
    });
  });

  describe('Enforce-critical mode', () => {
    test('denies requests at error threshold (80%)', () => {
      governor.setMode('enforce-critical');

      const session = 'ses-enforce-error';
      const model = 'gpt-5'; // 100,000 max, error at 80%

      // Consume 79% of budget
      governor.consumeTokens(session, model, 79000);

      // Propose 2% more → would reach 81% (error threshold)
      const check = governor.checkBudget(session, model, 2000);
      expect(check.status).toBe('error');
      expect(check.allowed).toBe(false); // enforce-critical blocks it
      expect(check.message).toContain('Request denied');
    });

    test('allows requests below error threshold', () => {
      governor.setMode('enforce-critical');

      const session = 'ses-enforce-ok';
      const model = 'gpt-5';

      // Consume 70% of budget (below warn threshold of 75%)
      governor.consumeTokens(session, model, 70000);

      // Propose 4% more → would reach 74% (below warn)
      const check = governor.checkBudget(session, model, 4000);
      expect(check.status).toBe('ok');
      expect(check.allowed).toBe(true);
    });

    test('allows requests at warn threshold (75%)', () => {
      governor.setMode('enforce-critical');

      const session = 'ses-enforce-warn';
      const model = 'gpt-5';

      // Consume 70% of budget
      governor.consumeTokens(session, model, 70000);

      // Propose 5% more → would reach 75% (warn threshold)
      const check = governor.checkBudget(session, model, 5000);
      expect(check.status).toBe('warn');
      expect(check.allowed).toBe(true); // warn is still allowed in enforce-critical
    });

    test('denies requests that exceed max', () => {
      governor.setMode('enforce-critical');

      const session = 'ses-enforce-exceed';
      const model = 'gpt-5';

      governor.consumeTokens(session, model, 99000);

      const check = governor.checkBudget(session, model, 2000);
      expect(check.status).toBe('exceeded');
      expect(check.allowed).toBe(false);
    });
  });

  describe('Environment variable mode', () => {
    test('reads mode from OPENCODE_BUDGET_MODE env var', () => {
      const prev = process.env.OPENCODE_BUDGET_MODE;
      try {
        process.env.OPENCODE_BUDGET_MODE = 'enforce-critical';
        const gov = new Governor({ autoLoad: false });
        expect(gov.getMode()).toBe('enforce-critical');
      } finally {
        if (prev !== undefined) {
          process.env.OPENCODE_BUDGET_MODE = prev;
        } else {
          delete process.env.OPENCODE_BUDGET_MODE;
        }
      }
    });
  });
});
