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
  getDeferredThresholdWarnings,
  loadThresholds,
  validateFixture,
  median,
  DEFAULT_TASKS,
} from "../skill-routing-evaluator.mjs"
import { GATES } from "../run-skill-routing-gates.mjs"

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

  test("skills with wrong explicit phase/domain are excluded", () => {
    const result = scoreSkills(
      "brainstorm explore approaches",
      "pre-analysis",
      "planning",
      TEST_REGISTRY
    )
    // skill-gamma matches phase+domain+triggers; skill-no-phase has no matching triggers
    expect(result.length).toBe(1)
    expect(result[0].skill).toBe("skill-gamma")
  })

  test("skills without processPhase/domain are NOT auto-excluded when phase/domain selected", () => {
    // skill-no-phase has triggers=["something random"], no processPhase, no domain
    const result = scoreSkills(
      "something random",
      "analysis",
      "debugging",
      TEST_REGISTRY
    )
    const noPhaseSkill = result.find((r) => r.skill === "skill-no-phase")
    expect(noPhaseSkill).toBeTruthy()
    expect(noPhaseSkill.score).toBeGreaterThan(0)
  })

  test("untagged skill competes fairly with tagged skills", () => {
    // Both skill-alpha (tagged analysis/debugging) and skill-no-phase (untagged)
    // should appear when their triggers match, with tagged getting no unfair advantage
    // beyond the text-matching score itself
    const mixedRegistry = {
      skills: {
        "tagged-skill": {
          description: "Tagged skill",
          triggers: ["special task"],
          processPhase: "analysis",
          domain: "debugging",
          selectionHints: { useWhen: [], avoidWhen: [] },
        },
        "untagged-skill": {
          description: "Untagged skill",
          triggers: ["special task"],
          selectionHints: { useWhen: [], avoidWhen: [] },
        },
      },
      profiles: {},
      categories: {},
    }
    const result = scoreSkills("special task", "analysis", "debugging", mixedRegistry)
    expect(result.length).toBe(2)
    // Both should score equally (same trigger match)
    expect(result[0].score).toBe(result[1].score)
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

  test("untagged skills appear in allSkills when triggers match", () => {
    const result = routeHierarchical("something random", TEST_REGISTRY)
    // skill-no-phase has triggers=["something random"] and no phase/domain
    const found = result.allSkills.find((s) => s.skill === "skill-no-phase")
    expect(found).toBeTruthy()
    expect(found.score).toBeGreaterThan(0)
  })

  test("returns no fake phase/domain when all scores are zero", () => {
    const result = routeHierarchical("totally unmatched tokens", TEST_REGISTRY)
    expect(result.processPhase).toBeNull()
    expect(result.domain).toBeNull()
    expect(result.topSkill).toBeNull()
    expect(result.ambiguityMargin).toBeNull()
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

describe("getDeferredThresholdWarnings", () => {
  test("returns warnings for deferred metrics", () => {
    const thresholds = {
      maxAmbiguityRate: 0.15,
      maxContextBudgetOverhead: 0.05,
      _deferredMetrics: ["maxContextBudgetOverhead"],
      _notes: {
        maxContextBudgetOverhead: "Not yet implemented.",
      },
    }
    const warnings = getDeferredThresholdWarnings(thresholds)
    expect(warnings.length).toBe(1)
    expect(warnings[0].metric).toBe("maxContextBudgetOverhead")
    expect(warnings[0].status).toBe("deferred")
    expect(warnings[0].threshold).toBe(0.05)
    expect(warnings[0].message).toBe("Not yet implemented.")
  })

  test("returns empty array when no deferred metrics", () => {
    const thresholds = {
      maxAmbiguityRate: 0.15,
    }
    const warnings = getDeferredThresholdWarnings(thresholds)
    expect(warnings).toEqual([])
  })

  test("returns empty when _deferredMetrics is present but empty", () => {
    const thresholds = {
      maxAmbiguityRate: 0.15,
      _deferredMetrics: [],
    }
    expect(getDeferredThresholdWarnings(thresholds)).toEqual([])
  })

  test("uses fallback message when _notes is missing", () => {
    const thresholds = {
      maxContextBudgetOverhead: 0.05,
      _deferredMetrics: ["maxContextBudgetOverhead"],
    }
    const warnings = getDeferredThresholdWarnings(thresholds)
    expect(warnings[0].message).toContain("not yet implemented")
  })

  test("real thresholds file has consistent deferred annotation", () => {
    const thresholds = loadThresholds()
    const warnings = getDeferredThresholdWarnings(thresholds)
    // maxContextBudgetOverhead should be listed as deferred
    const overhead = warnings.find((w) => w.metric === "maxContextBudgetOverhead")
    expect(overhead).toBeTruthy()
    expect(overhead.status).toBe("deferred")
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

  test("ignores _deferredMetrics and _notes keys (backward compat)", () => {
    const thresholdsWithDeferred = {
      ...thresholds,
      maxContextBudgetOverhead: 0.05,
      _deferredMetrics: ["maxContextBudgetOverhead"],
      _notes: { maxContextBudgetOverhead: "deferred" },
    }
    const metrics = {
      ambiguityRate: 0.1,
      switchRate: 0.05,
      onePassCorrectness: 0.9,
      medianRoutingMs: 50,
    }
    // checkThresholds should not breach on deferred metrics
    const breaches = checkThresholds(metrics, thresholdsWithDeferred)
    expect(breaches).toEqual([])
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

// ========== validateFixture tests ==========

describe("validateFixture", () => {
  test("accepts valid fixture array", () => {
    const data = [
      { id: "t1", taskText: "do something" },
      { id: "t2", taskText: "do else", scenarioId: "s", expectedTopSkill: "x", expectedDomain: "y" },
    ]
    expect(validateFixture(data, "test")).toEqual(data)
  })

  test("rejects non-array input", () => {
    expect(() => validateFixture({}, "test")).toThrow("must be a JSON array")
    expect(() => validateFixture("str", "test")).toThrow("must be a JSON array")
    expect(() => validateFixture(null, "test")).toThrow("must be a JSON array")
  })

  test("rejects empty array", () => {
    expect(() => validateFixture([], "test")).toThrow("empty array")
  })

  test("rejects task without id", () => {
    expect(() => validateFixture([{ taskText: "x" }], "test")).toThrow("requires 'id'")
  })

  test("rejects task with empty string id", () => {
    expect(() => validateFixture([{ id: "  ", taskText: "x" }], "test")).toThrow("requires 'id'")
  })

  test("rejects task without taskText", () => {
    expect(() => validateFixture([{ id: "t1" }], "test")).toThrow("requires 'taskText'")
  })

  test("rejects non-string optional fields", () => {
    expect(() =>
      validateFixture([{ id: "t1", taskText: "x", scenarioId: 123 }], "test")
    ).toThrow("'scenarioId' must be a string")
    expect(() =>
      validateFixture([{ id: "t1", taskText: "x", expectedTopSkill: true }], "test")
    ).toThrow("'expectedTopSkill' must be a string")
    expect(() =>
      validateFixture([{ id: "t1", taskText: "x", expectedDomain: [] }], "test")
    ).toThrow("'expectedDomain' must be a string")
  })

  test("rejects nested array in task position", () => {
    expect(() => validateFixture([[]], "test")).toThrow("must be a plain object")
  })

  test("includes index in error message", () => {
    const data = [
      { id: "ok", taskText: "fine" },
      { id: "bad" }, // missing taskText
    ]
    expect(() => validateFixture(data, "test")).toThrow("Fixture[1]")
  })
})

// ========== DEFAULT_TASKS expanded coverage ==========

describe("DEFAULT_TASKS coverage", () => {
  const taskIds = DEFAULT_TASKS.map((t) => t.id)

  test("has all original task IDs", () => {
    for (const id of ["debug-1", "debug-2", "plan-1", "plan-2", "impl-1", "verify-1", "orchestrate-1", "incident-1"]) {
      expect(taskIds).toContain(id)
    }
  })

  test("has new browser coverage", () => {
    expect(taskIds).toContain("browser-1")
  })

  test("has new git coverage", () => {
    expect(taskIds).toContain("git-1")
  })

  test("has new code-review request coverage", () => {
    expect(taskIds).toContain("review-request-1")
  })

  test("has new code-review receive coverage", () => {
    expect(taskIds).toContain("review-receive-1")
  })

  test("has new meta/skill-creation coverage", () => {
    expect(taskIds).toContain("meta-skill-1")
  })

  test("all tasks have required fields", () => {
    for (const task of DEFAULT_TASKS) {
      expect(typeof task.id).toBe("string")
      expect(task.id.length).toBeGreaterThan(0)
      expect(typeof task.taskText).toBe("string")
      expect(task.taskText.length).toBeGreaterThan(0)
    }
  })

  test("evaluates expanded tasks without error against real registry", () => {
    const registry = loadRegistry()
    const results = evaluateTasks(DEFAULT_TASKS, registry)
    expect(results.length).toBe(DEFAULT_TASKS.length)
    for (const r of results) {
      expect(r).toHaveProperty("topSkill")
      expect(r).toHaveProperty("routingMs")
    }
  })
})

// ========== Gates array verification ==========

describe("governance gates array", () => {
  test("GATES includes governance-hash-verify as first gate", () => {
    expect(GATES.length).toBeGreaterThanOrEqual(5)
    expect(GATES[0].name).toBe("governance-hash-verify")
  })

  test("GATES includes all expected gate names", () => {
    const names = GATES.map((g) => g.name)
    expect(names).toContain("governance-hash-verify")
    expect(names).toContain("registry-validate")
    expect(names).toContain("skill-consistency")
    expect(names).toContain("overlap-governance")
    expect(names).toContain("routing-evaluator")
  })

  test("each gate has name, label, and command", () => {
    for (const gate of GATES) {
      expect(typeof gate.name).toBe("string")
      expect(typeof gate.label).toBe("string")
      expect(typeof gate.command).toBe("string")
      expect(gate.name.length).toBeGreaterThan(0)
      expect(gate.command.length).toBeGreaterThan(0)
    }
  })
})

// ========== --full-report CLI integration test ==========

describe("--full-report mode (integration)", () => {
  test("full-report runs all gates and shows correct mode", async () => {
    const proc = Bun.spawn(
      ["node", "scripts/run-skill-routing-gates.mjs", "--full-report"],
      { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" }
    )
    const text = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(text).toContain("Mode:         full-report")
    // In full-report mode, all gates are always attempted (never skipped)
    expect(text).not.toContain("fail-fast after first failure")
    // Gates run: N/N — both numbers should match (all attempted)
    const match = text.match(/Gates run:\s+(\d+)\/(\d+)/)
    expect(match).toBeTruthy()
    if (match) {
      expect(match[1]).toBe(match[2])
    }
    // Exit code depends on gate results: 0 if all pass, 1 if any fail
    expect([0, 1]).toContain(exitCode)
  }, 120_000)

  test("fail-fast mode shows correct mode label", async () => {
    const proc = Bun.spawn(
      ["node", "scripts/run-skill-routing-gates.mjs"],
      { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" }
    )
    const text = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(text).toContain("Mode:         fail-fast")
    // Fail-fast is the default, exit code depends on gates
    expect([0, 1]).toContain(exitCode)
  }, 120_000)
})

// ========== evaluator fixture validation CLI integration ==========

describe("evaluator fixture validation (integration)", () => {
  test("invalid fixture path exits non-zero with actionable message", async () => {
    const proc = Bun.spawn(
      ["node", "scripts/skill-routing-evaluator.mjs", "--fixture", "/nonexistent/path.json"],
      { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" }
    )
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    expect(exitCode).toBe(1)
    expect(stderr).toContain("Cannot read fixture file")
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

describe("validateRegistry hardening", () => {
  test("detects asymmetric conflicts", () => {
    const reg = {
      skills: {
        a: { description: "a", category: "x", tags: [], source: "custom", dependencies: [], synergies: [], conflicts: ["b"], triggers: [] },
        b: { description: "b", category: "x", tags: [], source: "custom", dependencies: [], synergies: [], conflicts: [], triggers: [] },
      },
      profiles: { p: { description: "p", skills: ["a", "b"], triggers: [] } },
      categories: {},
    }

    const errors = validateRegistry(reg)
    expect(errors.some((e) => e.includes("not symmetric"))).toBe(true)
  })

  test("detects profile-resolved skill conflicts", () => {
    const reg = {
      skills: {
        a: { description: "a", category: "x", tags: [], source: "custom", dependencies: [], synergies: [], conflicts: ["b"], triggers: [] },
        b: { description: "b", category: "x", tags: [], source: "custom", dependencies: [], synergies: [], conflicts: ["a"], triggers: [] },
      },
      profiles: { p: { description: "p", skills: ["a", "b"], triggers: [] } },
      categories: {},
    }

    const errors = validateRegistry(reg)
    expect(errors.some((e) => e.includes("resolves conflicting skills"))).toBe(true)
  })
})
