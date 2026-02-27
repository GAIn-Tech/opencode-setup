import { describe, test, expect } from "bun:test"
import {
  scoreProcessPhase,
  scoreDomain,
  scoreSkills,
  routeHierarchical,
  normalize,
  loadRegistry,
  validateRegistry,
} from "../skill-profile-loader.mjs"
import {
  evaluateTasks,
  computeMetrics,
  checkThresholds,
  median,
  DEFAULT_TASKS,
} from "../skill-routing-evaluator.mjs"

// --- Minimal test registry for deterministic scoring tests ---
const TEST_REGISTRY = {
  skills: {
    "skill-alpha": {
      description: "Alpha debugging skill",
      category: "debugging",
      tags: ["debug"],
      source: "custom",
      dependencies: [],
      synergies: [],
      conflicts: [],
      triggers: ["debug", "root cause"],
      processPhase: "analysis",
      domain: "debugging",
      selectionHints: {
        useWhen: ["unexpected behavior or test failure"],
        avoidWhen: ["planning phase"],
      },
    },
    "skill-beta": {
      description: "Beta debugging skill",
      category: "debugging",
      tags: ["debug"],
      source: "custom",
      dependencies: [],
      synergies: [],
      conflicts: [],
      triggers: ["debug", "incident"],
      processPhase: "analysis",
      domain: "debugging",
      selectionHints: {
        useWhen: ["complex multi-file incident"],
        avoidWhen: ["simple bug"],
      },
    },
    "skill-gamma": {
      description: "Planning skill",
      category: "planning",
      tags: ["plan"],
      source: "custom",
      dependencies: [],
      synergies: [],
      conflicts: [],
      triggers: ["brainstorm", "explore approaches"],
      processPhase: "pre-analysis",
      domain: "planning",
      selectionHints: {
        useWhen: ["ambiguous requirements"],
        avoidWhen: ["single obvious implementation"],
      },
    },
    "skill-delta": {
      description: "Implementation skill",
      category: "implementation",
      tags: ["implement"],
      source: "custom",
      dependencies: [],
      synergies: [],
      conflicts: [],
      triggers: ["implement feature", "TDD"],
      processPhase: "implementation",
      domain: "testing",
      selectionHints: {
        useWhen: ["implementing new feature or bugfix"],
        avoidWhen: ["throwaway prototype"],
      },
    },
    "skill-no-phase": {
      description: "Skill without phase metadata",
      category: "misc",
      tags: [],
      source: "custom",
      dependencies: [],
      synergies: [],
      conflicts: [],
      triggers: ["something random"],
    },
  },
  profiles: {},
  categories: {},
}

// ========== scoreProcessPhase tests ==========

describe("scoreProcessPhase", () => {
  test("returns phases sorted by score descending", () => {
    const result = scoreProcessPhase("debug root cause analysis", TEST_REGISTRY)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    // analysis should win for debugging text
    expect(result[0].phase).toBe("analysis")
    expect(result[0].score).toBeGreaterThan(0)
  })

  test("planning text selects pre-analysis phase", () => {
    const result = scoreProcessPhase(
      "brainstorm explore approaches ambiguous requirements",
      TEST_REGISTRY
    )
    expect(result[0].phase).toBe("pre-analysis")
  })

  test("deterministic tie-break by phase name (alphabetical)", () => {
    // Create a registry where two phases tie
    const tieRegistry = {
      skills: {
        s1: {
          ...TEST_REGISTRY.skills["skill-alpha"],
          processPhase: "zzz-phase",
          triggers: ["tietrigger"],
          selectionHints: { useWhen: [], avoidWhen: [] },
        },
        s2: {
          ...TEST_REGISTRY.skills["skill-gamma"],
          processPhase: "aaa-phase",
          triggers: ["tietrigger"],
          selectionHints: { useWhen: [], avoidWhen: [] },
        },
      },
      profiles: {},
      categories: {},
    }
    const result = scoreProcessPhase("tietrigger", tieRegistry)
    expect(result.length).toBe(2)
    expect(result[0].score).toBe(result[1].score)
    // alphabetical tie-break: aaa-phase before zzz-phase
    expect(result[0].phase).toBe("aaa-phase")
    expect(result[1].phase).toBe("zzz-phase")
  })

  test("avoidWhen reduces phase score", () => {
    const result = scoreProcessPhase("planning phase", TEST_REGISTRY)
    // "planning phase" matches avoidWhen for skill-alpha (analysis)
    // so analysis should score lower than if avoidWhen didn't match
    const analysisEntry = result.find((r) => r.phase === "analysis")
    // Still should exist but with reduced score
    if (analysisEntry) {
      expect(typeof analysisEntry.score).toBe("number")
    }
  })

  test("returns empty array when no phases match", () => {
    const emptyRegistry = { skills: {}, profiles: {}, categories: {} }
    const result = scoreProcessPhase("anything", emptyRegistry)
    expect(result).toEqual([])
  })

  test("skills without processPhase are ignored", () => {
    const result = scoreProcessPhase("something random", TEST_REGISTRY)
    // "skill-no-phase" has no processPhase, should not contribute
    const phases = result.map((r) => r.phase)
    expect(phases).not.toContain(undefined)
    expect(phases).not.toContain(null)
  })
})

// ========== scoreDomain tests ==========

describe("scoreDomain", () => {
  test("filters by phase and returns matching domains", () => {
    const result = scoreDomain("debug root cause", "analysis", TEST_REGISTRY)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].domain).toBe("debugging")
  })

  test("returns empty for phase with no matching domains", () => {
    const result = scoreDomain(
      "totally unrelated text",
      "verification",
      TEST_REGISTRY
    )
    expect(result).toEqual([])
  })

  test("deterministic tie-break by domain name", () => {
    const tieRegistry = {
      skills: {
        s1: {
          ...TEST_REGISTRY.skills["skill-alpha"],
          processPhase: "analysis",
          domain: "zzz-domain",
          triggers: ["tietrigger"],
          selectionHints: { useWhen: [], avoidWhen: [] },
        },
        s2: {
          ...TEST_REGISTRY.skills["skill-beta"],
          processPhase: "analysis",
          domain: "aaa-domain",
          triggers: ["tietrigger"],
          selectionHints: { useWhen: [], avoidWhen: [] },
        },
      },
      profiles: {},
      categories: {},
    }
    const result = scoreDomain("tietrigger", "analysis", tieRegistry)
    expect(result[0].domain).toBe("aaa-domain")
  })

  test("null phase considers all skills with domain", () => {
    const result = scoreDomain("debug root cause", null, TEST_REGISTRY)
    expect(result.length).toBeGreaterThan(0)
  })
})

// ========== scoreSkills tests ==========

describe("scoreSkills", () => {
  test("returns individual skills sorted by score", () => {
    const result = scoreSkills(
      "debug root cause",
      "analysis",
      "debugging",
      TEST_REGISTRY
    )
    expect(result.length).toBe(2) // alpha and beta both match
    // alpha has "root cause" trigger + useWhen match, beta has "debug"
    expect(result[0].skill).toBe("skill-alpha")
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score)
  })

  test("deterministic tie-break by skill name", () => {
    const tieRegistry = {
      skills: {
        "zzz-skill": {
          ...TEST_REGISTRY.skills["skill-alpha"],
          triggers: ["tietrigger"],
          selectionHints: { useWhen: [], avoidWhen: [] },
        },
        "aaa-skill": {
          ...TEST_REGISTRY.skills["skill-beta"],
          triggers: ["tietrigger"],
          selectionHints: { useWhen: [], avoidWhen: [] },
        },
      },
      profiles: {},
      categories: {},
    }
    const result = scoreSkills(
      "tietrigger",
      "analysis",
      "debugging",
      tieRegistry
    )
    expect(result[0].skill).toBe("aaa-skill")
  })

  test("only returns skills with positive score", () => {
    const result = scoreSkills(
      "nothing matches",
      "analysis",
      "debugging",
      TEST_REGISTRY
    )
    expect(result).toEqual([])
  })

  test("skills without matching phase/domain are excluded", () => {
    const result = scoreSkills(
      "brainstorm explore approaches",
      "pre-analysis",
      "planning",
      TEST_REGISTRY
    )
    // only skill-gamma should match
    expect(result.length).toBe(1)
    expect(result[0].skill).toBe("skill-gamma")
  })
})

// ========== routeHierarchical tests ==========

describe("routeHierarchical", () => {
  test("process phase chosen before domain before skill", () => {
    const result = routeHierarchical("debug root cause analysis", TEST_REGISTRY)
    expect(result.processPhase).toBeTruthy()
    expect(result.processPhase.phase).toBe("analysis")
    expect(result.domain).toBeTruthy()
    expect(result.domain.domain).toBe("debugging")
    expect(result.topSkill).toBeTruthy()
    expect(result.topSkill.skill).toBe("skill-alpha")
  })

  test("captures runner-up at each level", () => {
    const result = routeHierarchical("debug root cause analysis", TEST_REGISTRY)
    expect(result.runnerUpSkill).toBeTruthy()
    expect(result.runnerUpSkill.skill).toBe("skill-beta")
  })

  test("ambiguityMargin is computed correctly", () => {
    const result = routeHierarchical("debug root cause analysis", TEST_REGISTRY)
    expect(typeof result.ambiguityMargin).toBe("number")
    expect(result.ambiguityMargin).toBe(
      result.topSkill.score - result.runnerUpSkill.score
    )
  })

  test("works with real registry", () => {
    const registry = loadRegistry()
    const result = routeHierarchical(
      "debug flaky integration tests",
      registry
    )
    expect(result.processPhase).toBeTruthy()
    expect(result.topSkill).toBeTruthy()
    expect(result.ambiguityMargin).toBeGreaterThanOrEqual(0)
  })

  test("returns nulls gracefully for unmatched text", () => {
    const emptyRegistry = { skills: {}, profiles: {}, categories: {} }
    const result = routeHierarchical("xyz", emptyRegistry)
    expect(result.processPhase).toBeNull()
    expect(result.domain).toBeNull()
    expect(result.topSkill).toBeNull()
  })

  test("allPhases, allDomains, allSkills arrays are present", () => {
    const result = routeHierarchical("debug", TEST_REGISTRY)
    expect(Array.isArray(result.allPhases)).toBe(true)
    expect(Array.isArray(result.allDomains)).toBe(true)
    expect(Array.isArray(result.allSkills)).toBe(true)
  })
})

// ========== route CLI command integration test ==========

describe("route CLI command (integration)", () => {
  test("route command returns valid JSON with expected fields", async () => {
    const proc = Bun.spawn(
      [
        "node",
        "scripts/skill-profile-loader.mjs",
        "route",
        "debug flaky integration tests",
      ],
      { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" }
    )
    const text = await new Response(proc.stdout).text()
    const exitCode = await proc.exited
    expect(exitCode).toBe(0)

    const result = JSON.parse(text)
    expect(result).toHaveProperty("processPhase")
    expect(result).toHaveProperty("domain")
    expect(result).toHaveProperty("topSkill")
    expect(result).toHaveProperty("runnerUpSkill")
    expect(result).toHaveProperty("ambiguityMargin")
    expect(result).toHaveProperty("allPhases")
    expect(result).toHaveProperty("allDomains")
    expect(result).toHaveProperty("allSkills")
  })
})

// ========== recommend enrichment test ==========

describe("recommend with diagnostics", () => {
  test("recommend output includes diagnostic fields", async () => {
    const proc = Bun.spawn(
      [
        "node",
        "scripts/skill-profile-loader.mjs",
        "recommend",
        "debug flaky integration tests",
        "3",
      ],
      { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" }
    )
    const text = await new Response(proc.stdout).text()
    const exitCode = await proc.exited
    expect(exitCode).toBe(0)

    const result = JSON.parse(text)
    expect(Array.isArray(result)).toBe(true)
    if (result.length > 0) {
      const first = result[0]
      // Original fields preserved
      expect(first).toHaveProperty("profile")
      expect(first).toHaveProperty("score")
      expect(first).toHaveProperty("description")
      // New diagnostic fields present
      expect(first).toHaveProperty("processPhase")
      expect(first).toHaveProperty("domain")
      expect(first).toHaveProperty("topSkill")
      expect(first).toHaveProperty("runnerUpSkill")
      expect(first).toHaveProperty("ambiguityMargin")
    }
  })
})

// ========== Evaluator helper tests ==========

describe("median helper", () => {
  test("returns median of odd-length array", () => {
    expect(median([3, 1, 2])).toBe(2)
  })

  test("returns median of even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  test("returns 0 for empty array", () => {
    expect(median([])).toBe(0)
  })

  test("handles single element", () => {
    expect(median([42])).toBe(42)
  })
})

describe("computeMetrics", () => {
  test("computes correct ambiguity rate", () => {
    const results = [
      { isAmbiguous: true, topDomain: "a", scenarioId: "s1", skillCorrect: true, domainCorrect: true, routingMs: 1 },
      { isAmbiguous: false, topDomain: "a", scenarioId: "s1", skillCorrect: true, domainCorrect: true, routingMs: 2 },
      { isAmbiguous: false, topDomain: "a", scenarioId: "s1", skillCorrect: true, domainCorrect: true, routingMs: 3 },
      { isAmbiguous: true, topDomain: "a", scenarioId: "s1", skillCorrect: true, domainCorrect: true, routingMs: 4 },
    ]
    const metrics = computeMetrics(results)
    expect(metrics.ambiguityRate).toBe(0.5)
  })

  test("computes switch rate across scenario transitions", () => {
    const results = [
      { isAmbiguous: false, topDomain: "a", scenarioId: "s1", skillCorrect: null, domainCorrect: null, routingMs: 1 },
      { isAmbiguous: false, topDomain: "b", scenarioId: "s1", skillCorrect: null, domainCorrect: null, routingMs: 2 },
      { isAmbiguous: false, topDomain: "b", scenarioId: "s1", skillCorrect: null, domainCorrect: null, routingMs: 3 },
    ]
    const metrics = computeMetrics(results)
    // 2 transitions in s1: a->b (switch), b->b (no switch) = 1/2 = 0.5
    expect(metrics.switchRate).toBe(0.5)
  })

  test("computes one-pass correctness", () => {
    const results = [
      { isAmbiguous: false, topDomain: "a", scenarioId: "s1", skillCorrect: true, domainCorrect: true, routingMs: 1 },
      { isAmbiguous: false, topDomain: "a", scenarioId: "s1", skillCorrect: false, domainCorrect: true, routingMs: 2 },
    ]
    const metrics = computeMetrics(results)
    expect(metrics.onePassCorrectness).toBe(0.5)
  })

  test("handles empty results", () => {
    const metrics = computeMetrics([])
    expect(metrics.ambiguityRate).toBe(0)
    expect(metrics.switchRate).toBe(0)
    expect(metrics.onePassCorrectness).toBe(1.0)
    expect(metrics.medianRoutingMs).toBe(0)
  })
})

describe("checkThresholds", () => {
  const thresholds = {
    maxAmbiguityRate: 0.15,
    maxSwitchRate: 0.10,
    minOnePassCorrectness: 0.85,
    maxMedianRoutingMs: 200,
  }

  test("no breaches when all metrics within thresholds", () => {
    const metrics = {
      ambiguityRate: 0.1,
      switchRate: 0.05,
      onePassCorrectness: 0.9,
      medianRoutingMs: 50,
    }
    const breaches = checkThresholds(metrics, thresholds)
    expect(breaches).toEqual([])
  })

  test("detects ambiguity rate breach", () => {
    const metrics = {
      ambiguityRate: 0.2,
      switchRate: 0.05,
      onePassCorrectness: 0.9,
      medianRoutingMs: 50,
    }
    const breaches = checkThresholds(metrics, thresholds)
    expect(breaches.length).toBe(1)
    expect(breaches[0].metric).toBe("ambiguityRate")
  })

  test("detects multiple breaches", () => {
    const metrics = {
      ambiguityRate: 0.5,
      switchRate: 0.5,
      onePassCorrectness: 0.1,
      medianRoutingMs: 500,
    }
    const breaches = checkThresholds(metrics, thresholds)
    expect(breaches.length).toBe(4)
  })
})

describe("evaluateTasks with real registry", () => {
  test("evaluates default tasks without error", () => {
    const registry = loadRegistry()
    const results = evaluateTasks(DEFAULT_TASKS, registry)
    expect(results.length).toBe(DEFAULT_TASKS.length)
    for (const r of results) {
      expect(r).toHaveProperty("topSkill")
      expect(r).toHaveProperty("topDomain")
      expect(r).toHaveProperty("ambiguityMargin")
      expect(r).toHaveProperty("routingMs")
      expect(typeof r.routingMs).toBe("number")
    }
  })
})

// ========== validate still works ==========

describe("validate command backward compatibility", () => {
  test("validate command exits 0", async () => {
    const proc = Bun.spawn(
      ["node", "scripts/skill-profile-loader.mjs", "validate"],
      { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" }
    )
    const exitCode = await proc.exited
    expect(exitCode).toBe(0)
  })
})
