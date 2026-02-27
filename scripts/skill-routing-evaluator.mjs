#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadRegistry, routeHierarchical } from "./skill-profile-loader.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const THRESHOLDS_PATH = path.resolve(__dirname, "skill-routing-thresholds.json")

// --- Built-in default evaluation tasks ---
const DEFAULT_TASKS = [
  {
    id: "debug-1",
    scenarioId: "debugging",
    taskText: "debug flaky integration tests",
    expectedDomain: "debugging",
    expectedTopSkill: "systematic-debugging",
  },
  {
    id: "debug-2",
    scenarioId: "debugging",
    taskText: "fix failing test with root cause analysis",
    expectedDomain: "debugging",
    expectedTopSkill: "systematic-debugging",
  },
  {
    id: "plan-1",
    scenarioId: "planning",
    taskText: "let's brainstorm how to redesign the auth system",
    expectedDomain: "planning",
    expectedTopSkill: "brainstorming",
  },
  {
    id: "plan-2",
    scenarioId: "planning",
    taskText: "write a plan for the new feature before we code",
    expectedDomain: "planning",
    expectedTopSkill: "writing-plans",
  },
  {
    id: "impl-1",
    scenarioId: "implementation",
    taskText: "implement feature with TDD red-green-refactor cycle",
    expectedDomain: "testing",
    expectedTopSkill: "test-driven-development",
  },
  {
    id: "verify-1",
    scenarioId: "verification",
    taskText: "verify before done, check completion gates before PR",
    expectedDomain: "quality",
    expectedTopSkill: "verification-before-completion",
  },
  {
    id: "orchestrate-1",
    scenarioId: "orchestration",
    taskText: "multi-step ambiguous cross-cutting task needing dynamic workflow",
    expectedDomain: "orchestration",
    expectedTopSkill: "task-orchestrator",
  },
  {
    id: "incident-1",
    scenarioId: "debugging",
    taskText: "complex multi-file incident response needing structured triage",
    expectedDomain: "debugging",
    expectedTopSkill: "incident-commander",
  },
]

function loadThresholds(thresholdsPath = THRESHOLDS_PATH) {
  const raw = fs.readFileSync(thresholdsPath, "utf8")
  return JSON.parse(raw)
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

function main(argv) {
  const args = argv
  let fixturePath = null
  let dryRun = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--fixture" && args[i + 1]) {
      fixturePath = args[++i]
    } else if (args[i] === "--dry-run") {
      dryRun = true
    }
  }

  const registry = loadRegistry()
  const thresholds = loadThresholds()

  if (dryRun) {
    const tasks = fixturePath
      ? JSON.parse(fs.readFileSync(fixturePath, "utf8"))
      : DEFAULT_TASKS
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          taskCount: tasks.length,
          thresholds,
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
    process.exit(0)
  }

  const tasks = fixturePath
    ? JSON.parse(fs.readFileSync(fixturePath, "utf8"))
    : DEFAULT_TASKS

  const results = evaluateTasks(tasks, registry)
  const metrics = computeMetrics(results)
  const breaches = checkThresholds(metrics, thresholds)

  const report = {
    timestamp: new Date().toISOString(),
    taskCount: tasks.length,
    metrics,
    thresholds,
    breaches,
    pass: breaches.length === 0,
    details: results,
  }

  console.log(JSON.stringify(report, null, 2))

  if (breaches.length > 0) {
    process.exit(1)
  }
  process.exit(0)
}

// Export for testing
export {
  DEFAULT_TASKS,
  loadThresholds,
  evaluateTasks,
  computeMetrics,
  checkThresholds,
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
