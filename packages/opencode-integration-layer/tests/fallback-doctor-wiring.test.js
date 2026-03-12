const { describe, test, expect } = require("bun:test");
const { IntegrationLayer } = require("../src/index.js");

describe("FallbackDoctor wiring in IntegrationLayer", () => {
  test("validateFallbackChain delegates to fallbackDoctor.validateChain", () => {
    const mockFallbackDoctor = {
      validateChain: (models) => ({
        valid: true,
        issues: [],
        suggestions: [],
      }),
    };

    const integration = new IntegrationLayer({
      fallbackDoctor: mockFallbackDoctor,
    });

    const result = integration.validateFallbackChain([
      "claude-opus-4-6",
      "claude-sonnet-4-5",
    ]);

    expect(result).toEqual({
      valid: true,
      issues: [],
      suggestions: [],
    });
  });

  test("diagnoseFallbacks delegates to fallbackDoctor.diagnose", () => {
    const mockFallbackDoctor = {
      diagnose: (config) => ({
        healthy: true,
        modelCount: 2,
        issues: [],
        suggestions: [],
        chain: ["claude-opus-4-6", "claude-sonnet-4-5"],
      }),
    };

    const integration = new IntegrationLayer({
      fallbackDoctor: mockFallbackDoctor,
    });

    const result = integration.diagnoseFallbacks({});

    expect(result).toEqual({
      healthy: true,
      modelCount: 2,
      issues: [],
      suggestions: [],
      chain: ["claude-opus-4-6", "claude-sonnet-4-5"],
    });
  });

  test("validateFallbackChain returns null when fallbackDoctor unavailable", () => {
    const integration = new IntegrationLayer({});

    const result = integration.validateFallbackChain([
      "claude-opus-4-6",
      "claude-sonnet-4-5",
    ]);

    expect(result).toBeNull();
  });

  test("diagnoseFallbacks returns null when fallbackDoctor throws", () => {
    const mockFallbackDoctor = {
      diagnose: () => {
        throw new Error("Diagnosis failed");
      },
    };

    const integration = new IntegrationLayer({
      fallbackDoctor: mockFallbackDoctor,
    });

    const result = integration.diagnoseFallbacks({});

    expect(result).toBeNull();
  });
});
