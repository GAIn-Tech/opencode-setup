#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadRegistry, routeHierarchical } from "./skill-profile-loader.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const THRESHOLDS_PATH = path.resolve(__dirname, "skill-routing-thresholds.json")
const TIER_EVIDENCE_PATH = path.resolve(
  __dirname,
  "../.sisyphus/evidence/skill-classification-recommendations.json"
)
const REQUIRED_TIERS = ["default", "manual", "dormant", "candidate-prune"]

// --- Built-in default evaluation tasks ---
const DEFAULT_TASKS = [
  {
    id: "core-debug-1",
    scenarioId: "core-debug-1",
    taskText: "debug flaky integration tests",
    expectedTopSkill: "systematic-debugging",
  },
  {
    id: "core-plan-1",
    scenarioId: "core-plan-1",
    taskText: "write a plan for the new feature before we code",
    expectedTopSkill: "writing-plans",
  },
  {
    id: "core-audit-1",
    scenarioId: "core-audit-1",
    taskText: "audit codebase and run a coherence pass to identify disconnected architecture",
    expectedTopSkill: "codebase-auditor",
  },
  {
    id: "core-verify-1",
    scenarioId: "core-verify-1",
    taskText: "verify before done, check completion gates before PR",
    expectedTopSkill: "verification-before-completion",
  },
  {
    id: "core-tdd-1",
    scenarioId: "core-tdd-1",
    taskText: "implement feature with TDD red-green-refactor cycle",
    expectedTopSkill: "test-driven-development",
  },
  {
    id: "core-orchestrate-1",
    scenarioId: "core-orchestrate-1",
    taskText: "complex workflow with unclear approach for a multi-step task",
    expectedTopSkill: "task-orchestrator",
  },
  {
    id: "core-git-1",
    scenarioId: "core-git-1",
    taskText: "commit staged changes then squash the last three commits into one",
    expectedTopSkill: "git-master",
  },
  {
    id: "core-context-1",
    scenarioId: "core-context-1",
    taskText: "need library docs and api reference, run ctx7 query before coding",
    expectedTopSkill: "context7",
  },
  {
    id: "core-skill-discovery-1",
    scenarioId: "core-skill-discovery-1",
    taskText: "starting conversation and need to find skill discovery guidance",
    expectedTopSkill: "using-superpowers",
  },
]

function loadThresholds(thresholdsPath = THRESHOLDS_PATH) {
  const raw = fs.readFileSync(thresholdsPath, "utf8")
  return JSON.parse(raw)
}

function loadTierEvidence(tierEvidencePath = TIER_EVIDENCE_PATH) {
  const raw = JSON.parse(fs.readFileSync(tierEvidencePath, "utf8"))
  const tierRecommendations = raw?.tierRecommendations

  if (!tierRecommendations || typeof tierRecommendations !== "object") {
    throw new Error(`Invalid tier evidence format: ${tierEvidencePath}`)
  }

  for (const tier of REQUIRED_TIERS) {
    if (!Array.isArray(tierRecommendations[tier])) {
      throw new Error(
        `Tier '${tier}' missing or not an array in tier evidence: ${tierEvidencePath}`
      )
    }
  }

  const skillToTier = new Map()
  const duplicateAssignments = []
  for (const tier of REQUIRED_TIERS) {
    for (const skill of tierRecommendations[tier]) {
      if (skillToTier.has(skill)) {
        duplicateAssignments.push({ skill, tiers: [skillToTier.get(skill), tier] })
      } else {
        skillToTier.set(skill, tier)
      }
    }
  }

  return {
    tierRecommendations,
    skillToTier,
    duplicateAssignments,
  }
}

/**
 * Validate fixture data shape. Throws on invalid input with actionable message.
 * @param {unknown} data - Parsed fixture data
 * @param {string} source - Description of origin (for error messages)
 * @returns {Array} - Validated array of task objects
 */
function validateFixture(data, source) {
  if (!Array.isArray(data)) {
    throw new Error(
      `Fixture from ${source} must be a JSON array of task objects, got ${typeof data}.`
    )
  }
  if (data.length === 0) {
    throw new Error(
      `Fixture from ${source} is an empty array. At least one task is required.`
    )
  }
  for (let i = 0; i < data.length; i++) {
    const task = data[i]
    const prefix = `Fixture[${i}] from ${source}`
    if (typeof task !== "object" || task === null || Array.isArray(task)) {
      throw new Error(
        `${prefix}: must be a plain object, got ${Array.isArray(task) ? "array" : typeof task}.`
      )
    }
    if (typeof task.id !== "string" || !task.id.trim()) {
      throw new Error(`${prefix}: requires 'id' as a non-empty string.`)
    }
    if (typeof task.taskText !== "string" || !task.taskText.trim()) {
      throw new Error(`${prefix}: requires 'taskText' as a non-empty string.`)
    }
    for (const opt of ["scenarioId", "expectedTopSkill", "expectedDomain"]) {
      if (opt in task && typeof task[opt] !== "string") {
        throw new Error(
          `${prefix}: optional field '${opt}' must be a string when present, got ${typeof task[opt]}.`
        )
      }
    }
    if ("enforceDefaultCore" in task && typeof task.enforceDefaultCore !== "boolean") {
      throw new Error(
        `${prefix}: optional field 'enforceDefaultCore' must be a boolean when present, got ${typeof task.enforceDefaultCore}.`
      )
    }
  }
  return data
}

/**
 * Load and validate a fixture file. Throws with actionable messages on failure.
 * @param {string} fixturePath - Path to the fixture JSON file
 * @returns {Array} - Validated array of task objects
 */
function loadAndValidateFixture(fixturePath) {
  let raw
  try {
    raw = fs.readFileSync(fixturePath, "utf8")
  } catch (err) {
    throw new Error(
      `Cannot read fixture file '${fixturePath}': ${err.message}\n` +
        `  Hint: verify the file exists and is readable.`
    )
  }
  let data
  try {
    data = JSON.parse(raw)
  } catch (err) {
    throw new Error(
      `Invalid JSON in fixture file '${fixturePath}': ${err.message}\n` +
        `  Hint: validate your JSON with a linter before passing to --fixture.`
    )
  }
  return validateFixture(data, fixturePath)
}

function median(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function evaluateTasks(tasks, registry) {
  const results = []

  for (const task of tasks) {
    const start = performance.now()
    const routing = routeHierarchical(task.taskText, registry)
    const elapsed = performance.now() - start

    const topSkillName = routing.topSkill ? routing.topSkill.skill : null
    const topDomainName = routing.domain ? routing.domain.domain : null

    const domainCorrect = task.expectedDomain
      ? topDomainName === task.expectedDomain
      : null
    const skillCorrect = task.expectedTopSkill
      ? topSkillName === task.expectedTopSkill
      : null

    // Ambiguous only when winner and runner-up are effectively tied.
    const isAmbiguous = routing.runnerUpSkill !== null && routing.ambiguityMargin <= 0

    results.push({
      id: task.id,
      scenarioId: task.scenarioId || null,
      taskText: task.taskText,
      topSkill: topSkillName,
      topDomain: topDomainName,
      processPhase: routing.processPhase ? routing.processPhase.phase : null,
      ambiguityMargin: routing.ambiguityMargin,
      isAmbiguous,
      domainCorrect,
      skillCorrect,
      routingMs: Math.round(elapsed * 100) / 100,
    })
  }

  return results
}

function computeMetrics(results) {
  const total = results.length
  if (total === 0) {
    return {
      ambiguityRate: 0,
      switchRate: 0,
      onePassCorrectness: 1.0,
      medianRoutingMs: 0,
    }
  }

  // Ambiguity rate: fraction of tasks with tied top-vs-runner-up score
  const ambiguousCount = results.filter((r) => r.isAmbiguous).length
  const ambiguityRate = ambiguousCount / total

  // Switch rate: for each scenario, count domain switches between consecutive tasks
  const scenarios = {}
  for (const r of results) {
    const sid = r.scenarioId || r.id
    if (!scenarios[sid]) scenarios[sid] = []
    scenarios[sid].push(r)
  }

  let totalTransitions = 0
  let switchCount = 0
  for (const [, scenarioResults] of Object.entries(scenarios)) {
    for (let i = 1; i < scenarioResults.length; i++) {
      totalTransitions++
      if (scenarioResults[i].topDomain !== scenarioResults[i - 1].topDomain) {
        switchCount++
      }
    }
  }
  const switchRate = totalTransitions > 0 ? switchCount / totalTransitions : 0

  // One-pass correctness: fraction of tasks with expected hints that matched
  const withExpectations = results.filter(
    (r) => r.skillCorrect !== null || r.domainCorrect !== null
  )
  const correctCount = withExpectations.filter((r) => {
    const skillOk = r.skillCorrect === null || r.skillCorrect === true
    const domainOk = r.domainCorrect === null || r.domainCorrect === true
    return skillOk && domainOk
  }).length
  const onePassCorrectness =
    withExpectations.length > 0 ? correctCount / withExpectations.length : 1.0

  // Median routing latency
  const latencies = results.map((r) => r.routingMs)
  const medianRoutingMs = median(latencies)

  return {
    ambiguityRate: Math.round(ambiguityRate * 1000) / 1000,
    switchRate: Math.round(switchRate * 1000) / 1000,
    onePassCorrectness: Math.round(onePassCorrectness * 1000) / 1000,
    medianRoutingMs: Math.round(medianRoutingMs * 100) / 100,
  }
}

function checkThresholds(metrics, thresholds) {
  const breaches = []

  if (metrics.ambiguityRate > thresholds.maxAmbiguityRate) {
    breaches.push({
      metric: "ambiguityRate",
      value: metrics.ambiguityRate,
      threshold: thresholds.maxAmbiguityRate,
      direction: "above",
    })
  }
  if (metrics.switchRate > thresholds.maxSwitchRate) {
    breaches.push({
      metric: "switchRate",
      value: metrics.switchRate,
      threshold: thresholds.maxSwitchRate,
      direction: "above",
    })
  }
  if (metrics.onePassCorrectness < thresholds.minOnePassCorrectness) {
    breaches.push({
      metric: "onePassCorrectness",
      value: metrics.onePassCorrectness,
      threshold: thresholds.minOnePassCorrectness,
      direction: "below",
    })
  }
  if (metrics.medianRoutingMs > thresholds.maxMedianRoutingMs) {
    breaches.push({
      metric: "medianRoutingMs",
      value: metrics.medianRoutingMs,
      threshold: thresholds.maxMedianRoutingMs,
      direction: "above",
    })
  }

  return breaches
}

/**
 * Identify threshold keys that are defined in the config but explicitly marked
 * as not-yet-implemented via the _deferredMetrics array. Returns structured
 * warnings so callers can surface them without false-positive enforcement.
 */
function getDeferredThresholdWarnings(thresholds) {
  const deferred = thresholds._deferredMetrics || []
  const warnings = []
  for (const metric of deferred) {
    if (metric in thresholds) {
      warnings.push({
        metric,
        threshold: thresholds[metric],
        status: "deferred",
        message:
          (thresholds._notes && thresholds._notes[metric]) ||
          `Metric '${metric}' defined in thresholds but not yet implemented in evaluator.`,
      })
    }
  }
  return warnings
}

function shouldEnforceDefaultCore(task, usingDefaultFixture) {
  if (usingDefaultFixture) return true
  return task.enforceDefaultCore === true
}

function evaluateDefaultCoreBreaches(results, tasks, tierEvidence, usingDefaultFixture) {
  const defaultAllowlist = new Set(tierEvidence.tierRecommendations.default)
  const breaches = []

  if (tierEvidence.duplicateAssignments.length > 0) {
    breaches.push({
      metric: "tierAssignments",
      value: tierEvidence.duplicateAssignments.length,
      threshold: 0,
      direction: "above",
      reason: "Duplicate tier assignments in classification evidence",
      details: tierEvidence.duplicateAssignments,
    })
  }

  for (const task of tasks) {
    if (!shouldEnforceDefaultCore(task, usingDefaultFixture)) continue
    if (!task.expectedTopSkill) continue

    if (!defaultAllowlist.has(task.expectedTopSkill)) {
      breaches.push({
        metric: "defaultCoreFixture",
        value: task.expectedTopSkill,
        threshold: "must be default-tier skill",
        direction: "outside",
        taskId: task.id,
        reason: `Fixture task '${task.id}' expects non-default skill '${task.expectedTopSkill}'`,
      })
    }
  }

  const resultById = new Map(results.map((result) => [result.id, result]))
  for (const task of tasks) {
    if (!shouldEnforceDefaultCore(task, usingDefaultFixture)) continue

    const result = resultById.get(task.id)
    const topSkill = result?.topSkill || null

    if (!topSkill) {
      breaches.push({
        metric: "defaultCoreSelection",
        value: null,
        threshold: "must select default-tier skill",
        direction: "outside",
        taskId: task.id,
        reason: `Task '${task.id}' did not produce a top skill under default-core enforcement`,
      })
      continue
    }

    const tier = tierEvidence.skillToTier.get(topSkill) || "untiered"
    if (tier !== "default") {
      breaches.push({
        metric: "defaultCoreLeakage",
        value: topSkill,
        threshold: "default-tier",
        direction: "outside",
        taskId: task.id,
        tier,
        reason: `Task '${task.id}' routed to non-default skill '${topSkill}' (${tier})`,
      })
    }
  }

  return breaches
}

function main(argv) {
  const args = argv
  let fixturePath = null
  let tierEvidencePath = TIER_EVIDENCE_PATH
  let dryRun = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--fixture" && args[i + 1]) {
      fixturePath = args[++i]
    } else if (args[i] === "--tier-evidence" && args[i + 1]) {
      tierEvidencePath = path.resolve(args[++i])
    } else if (args[i] === "--dry-run") {
      dryRun = true
    }
  }

  const registry = loadRegistry()
  const thresholds = loadThresholds()
  let tierEvidence

  try {
    tierEvidence = loadTierEvidence(tierEvidencePath)
  } catch (err) {
    console.error(`ERROR: ${err.message}`)
    process.exit(1)
  }

  const usingDefaultFixture = !fixturePath

  // Consolidate task loading with validation (runs for both --dry-run and evaluation)
  let tasks
  try {
    tasks = fixturePath
      ? loadAndValidateFixture(fixturePath)
      : DEFAULT_TASKS
  } catch (err) {
    console.error(`ERROR: ${err.message}`)
    process.exit(1)
  }

  if (dryRun) {
    const deferredWarnings = getDeferredThresholdWarnings(thresholds)
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          enforceDefaultCoreOnBuiltInFixture: usingDefaultFixture,
          defaultCoreAllowlist: tierEvidence.tierRecommendations.default,
          taskCount: tasks.length,
          thresholds,
          deferredWarnings,
          tasks: tasks.map((t) => ({
            id: t.id,
            taskText: t.taskText,
            expectedTopSkill: t.expectedTopSkill || null,
            expectedDomain: t.expectedDomain || null,
          })),
        },
        null,
        2
      )
    )
    if (deferredWarnings.length > 0) {
      for (const w of deferredWarnings) {
        console.warn(`WARNING: deferred metric '${w.metric}': ${w.message}`)
      }
    }
    process.exit(0)
  }

  const results = evaluateTasks(tasks, registry)
  const metrics = computeMetrics(results)
  const thresholdBreaches = checkThresholds(metrics, thresholds)
  const defaultCoreBreaches = evaluateDefaultCoreBreaches(
    results,
    tasks,
    tierEvidence,
    usingDefaultFixture
  )
  const breaches = [...thresholdBreaches, ...defaultCoreBreaches]
  const deferredWarnings = getDeferredThresholdWarnings(thresholds)

  const report = {
    timestamp: new Date().toISOString(),
    taskCount: tasks.length,
    metrics,
    thresholds,
    breaches,
    defaultCore: {
      enforced: usingDefaultFixture,
      allowlistSize: tierEvidence.tierRecommendations.default.length,
      leakageBreaches: defaultCoreBreaches,
      tierEvidencePath,
    },
    deferredWarnings,
    pass: breaches.length === 0,
    details: results,
  }

  console.log(JSON.stringify(report, null, 2))

  if (deferredWarnings.length > 0) {
    for (const w of deferredWarnings) {
      console.warn(`WARNING: deferred metric '${w.metric}': ${w.message}`)
    }
  }

  if (breaches.length > 0) {
    process.exit(1)
  }
  process.exit(0)
}

// Export for testing
export {
  DEFAULT_TASKS,
  loadThresholds,
  validateFixture,
  loadAndValidateFixture,
  loadTierEvidence,
  evaluateDefaultCoreBreaches,
  evaluateTasks,
  computeMetrics,
  checkThresholds,
  getDeferredThresholdWarnings,
  median,
}

// Only run CLI when this file is the entry point
const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(__filename) ||
  path.resolve(process.argv[1]) === path.resolve(__filename.replace(/\.mjs$/, ""))
)
if (isMain) {
  main(process.argv.slice(2))
}
