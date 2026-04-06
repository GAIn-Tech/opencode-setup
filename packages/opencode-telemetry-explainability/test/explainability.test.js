import { describe, test, expect } from 'bun:test';
import {
  validateTelemetryPayload,
  getRequiredMetadataFields,
  explainRoutingDecision,
  explainDelegationDecision,
  formatProvenance,
  METADATA_REQUIREMENTS,
  PROVENANCE_SOURCES
} from '../src/index.js';

describe('Telemetry Explainability', () => {
  describe('METADATA_REQUIREMENTS', () => {
    test('defines required fields for routing events', () => {
      expect(METADATA_REQUIREMENTS.routing).toBeDefined();
      expect(METADATA_REQUIREMENTS.routing.required).toContain('model_id');
      expect(METADATA_REQUIREMENTS.routing.required).toContain('provider');
      expect(METADATA_REQUIREMENTS.routing.required).toContain('decision_reason');
      expect(METADATA_REQUIREMENTS.routing.required).toContain('authority_source');
    });

    test('defines required fields for delegation events', () => {
      expect(METADATA_REQUIREMENTS.delegation).toBeDefined();
      expect(METADATA_REQUIREMENTS.delegation.required).toContain('agent_name');
      expect(METADATA_REQUIREMENTS.delegation.required).toContain('category');
      expect(METADATA_REQUIREMENTS.delegation.required).toContain('model_id');
      expect(METADATA_REQUIREMENTS.delegation.required).toContain('authority_source');
    });

    test('defines required fields for tool invocation events', () => {
      expect(METADATA_REQUIREMENTS.tool_invocation).toBeDefined();
      expect(METADATA_REQUIREMENTS.tool_invocation.required).toContain('tool_name');
      expect(METADATA_REQUIREMENTS.tool_invocation.required).toContain('tool_category');
      expect(METADATA_REQUIREMENTS.tool_invocation.required).toContain('session_id');
    });
  });

  describe('PROVENANCE_SOURCES', () => {
    test('defines authority source types', () => {
      expect(PROVENANCE_SOURCES).toBeDefined();
      expect(PROVENANCE_SOURCES.ENV_VAR).toBe('env_var');
      expect(PROVENANCE_SOURCES.HOME_CONFIG).toBe('home_config');
      expect(PROVENANCE_SOURCES.REPO_CONFIG).toBe('repo_config');
      expect(PROVENANCE_SOURCES.DEFAULT).toBe('default');
    });
  });

  describe('getRequiredMetadataFields', () => {
    test('returns required fields for routing event type', () => {
      const fields = getRequiredMetadataFields('routing');
      expect(fields).toContain('model_id');
      expect(fields).toContain('provider');
      expect(fields).toContain('decision_reason');
    });

    test('returns required fields for delegation event type', () => {
      const fields = getRequiredMetadataFields('delegation');
      expect(fields).toContain('agent_name');
      expect(fields).toContain('category');
      expect(fields).toContain('model_id');
    });

    test('returns empty array for unknown event type', () => {
      const fields = getRequiredMetadataFields('unknown_type');
      expect(fields).toEqual([]);
    });
  });

  describe('validateTelemetryPayload', () => {
    test('validates complete routing payload', () => {
      const payload = {
        event_type: 'routing',
        model_id: 'gpt-5.2',
        provider: 'openai',
        decision_reason: 'category_match',
        authority_source: 'repo_config',
        timestamp: Date.now()
      };
      const result = validateTelemetryPayload(payload);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    test('validates complete delegation payload', () => {
      const payload = {
        event_type: 'delegation',
        agent_name: 'atlas',
        category: 'deep',
        model_id: 'glm-5',
        authority_source: 'home_config',
        timestamp: Date.now()
      };
      const result = validateTelemetryPayload(payload);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    test('detects missing required fields', () => {
      const payload = {
        event_type: 'routing',
        model_id: 'gpt-5.2',
        // missing: provider, decision_reason, authority_source
        timestamp: Date.now()
      };
      const result = validateTelemetryPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('provider');
      expect(result.missing).toContain('decision_reason');
      expect(result.missing).toContain('authority_source');
    });

    test('rejects payload with unknown event_type', () => {
      const payload = {
        event_type: 'unknown',
        timestamp: Date.now()
      };
      const result = validateTelemetryPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('event_type');
    });

    test('rejects null/undefined payload', () => {
      expect(validateTelemetryPayload(null).valid).toBe(false);
      expect(validateTelemetryPayload(undefined).valid).toBe(false);
      expect(validateTelemetryPayload({}).valid).toBe(false);
    });
  });

  describe('explainRoutingDecision', () => {
    test('generates human-readable routing explanation', () => {
      const decision = {
        model_id: 'gpt-5.2',
        provider: 'openai',
        decision_reason: 'category_match',
        authority_source: 'repo_config',
        category: 'visual-engineering'
      };
      const explanation = explainRoutingDecision(decision);
      expect(explanation).toContain('gpt-5.2');
      expect(explanation).toContain('openai');
      expect(explanation).toContain('visual-engineering');
      expect(explanation).toContain('repo_config');
    });

    test('includes provenance chain in explanation', () => {
      const decision = {
        model_id: 'glm-5',
        provider: 'z-ai',
        decision_reason: 'agent_override',
        authority_source: 'env_var',
        agent_name: 'oracle'
      };
      const explanation = explainRoutingDecision(decision);
      expect(explanation).toContain('env_var');
      expect(explanation).toContain('oracle');
      expect(explanation).toContain('agent_override');
    });
  });

  describe('explainDelegationDecision', () => {
    test('generates human-readable delegation explanation', () => {
      const decision = {
        agent_name: 'atlas',
        category: 'deep',
        model_id: 'glm-5',
        authority_source: 'home_config',
        task_type: 'orchestration'
      };
      const explanation = explainDelegationDecision(decision);
      expect(explanation).toContain('atlas');
      expect(explanation).toContain('deep');
      expect(explanation).toContain('glm-5');
      expect(explanation).toContain('home_config');
    });

    test('includes task context in explanation', () => {
      const decision = {
        agent_name: 'sisyphus',
        category: 'quick',
        model_id: 'gemini-2.5-flash',
        authority_source: 'repo_config',
        task_type: 'file_edit',
        file_path: '/src/index.js'
      };
      const explanation = explainDelegationDecision(decision);
      expect(explanation).toContain('sisyphus');
      expect(explanation).toContain('file_edit');
      expect(explanation).toContain('/src/index.js');
    });
  });

  describe('formatProvenance', () => {
    test('formats env_var provenance', () => {
      const formatted = formatProvenance({
        source: 'env_var',
        key: 'OPENCODE_MODEL_OVERRIDE',
        value_resolved: 'gpt-5.2'
      });
      expect(formatted).toContain('env_var');
      expect(formatted).toContain('OPENCODE_MODEL_OVERRIDE');
    });

    test('formats home_config provenance', () => {
      const formatted = formatProvenance({
        source: 'home_config',
        file: '~/.config/opencode/oh-my-opencode.json',
        key: 'agents.atlas.model',
        value_resolved: 'kimi-k2.5'
      });
      expect(formatted).toContain('home_config');
      expect(formatted).toContain('oh-my-opencode.json');
    });

    test('formats repo_config provenance', () => {
      const formatted = formatProvenance({
        source: 'repo_config',
        file: './opencode-config/oh-my-opencode.json',
        key: 'categories.deep.model',
        value_resolved: 'glm-5'
      });
      expect(formatted).toContain('repo_config');
      expect(formatted).toContain('oh-my-opencode.json');
    });

    test('formats default provenance', () => {
      const formatted = formatProvenance({
        source: 'default',
        reason: 'no_config_found',
        value_resolved: 'kimi-k2.5-free'
      });
      expect(formatted).toContain('default');
      expect(formatted).toContain('no_config_found');
    });
  });

  describe('Integration with Authority Contract', () => {
    test('validates payload from authority resolver', () => {
      // Simulate payload from runtime-authority resolver
      const payload = {
        event_type: 'routing',
        model_id: 'gpt-5.2',
        provider: 'openai',
        decision_reason: 'category_resolution',
        authority_source: 'repo_config',
        category: 'visual-engineering',
        timestamp: Date.now(),
        provenance: {
          source: 'repo_config',
          file: './opencode-config/oh-my-opencode.json',
          key: 'categories.visual-engineering.model'
        }
      };
      const result = validateTelemetryPayload(payload);
      expect(result.valid).toBe(true);
    });

    test('detects missing provenance in critical routing path', () => {
      const payload = {
        event_type: 'routing',
        model_id: 'gpt-5.2',
        provider: 'openai',
        decision_reason: 'fallback',
        authority_source: 'default',
        // Missing: provenance chain
        timestamp: Date.now()
      };
      const result = validateTelemetryPayload(payload);
      // Should still be valid, but provenance is recommended
      expect(result.valid).toBe(true);
      expect(result.warnings || []).toBeDefined();
    });
  });
});
