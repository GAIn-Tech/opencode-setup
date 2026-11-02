#!/usr/bin/env node

/**
 * run-skill-routing-gates.mjs
 *
 * Sequential gate runner for skill routing governance.
 * Runs these gates in order, failing fast on first non-zero exit:
 *
 *   0. learning-gate.mjs --verify-hashes   (governance config hash integrity)
 *   1. skill-profile-loader.mjs validate   (registry integrity)
 *   2. check-skill-consistency.mjs          (registry ↔ compound-engineering parity)
 *   3. check-skill-overlap-governance.mjs   (overlap cluster policy)
 *   4. skill-routing-evaluator.mjs          (routing quality + default-core leakage checks)
 *   5. check-skill-coverage.mjs             (default-tier implied coverage + tiering integrity)
 *
 * Exit 0 = all gates pass
 * Exit 1 = at least one gate failed or threshold breached
 *
 * Options:
 *   --fixture <path>     Pass fixture file to evaluator (default: built-in tasks)
 *   --evidence <dir>     Write per-gate evidence JSON to this directory
 *   --full-report        Run ALL gates even after failures (default: fail-fast)
 */

import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// --- Parse args ---
const args = process.argv.slice(2)
let fixturePath = null
let evidenceDir = null
let fullReport = false

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--fixture" && args[i + 1]) {
    fixturePath = args[++i]
  } else if (args[i] === "--evidence" && args[i + 1]) {
    evidenceDir = args[++i]
  } else if (args[i] === "--full-report") {
    fullReport = true
  }
}

// --- Gate definitions ---
const NODE = process.execPath // Use same Node/Bun that invoked us
const tierEvidencePath = path.resolve(
  __dirname,
  "../.sisyphus/evidence/skill-classification-recommendations.json"
)

const evaluatorFixtureArgs = fixturePath
  ? ` --fixture ${fixturePath}`
  : ""

const GATES = [
  {
    name: "governance-hash-verify",
    label: "Governance Hash Verification",
    command: `"${NODE}" "${path.resolve(__dirname, "learning-gate.mjs")}" --verify-hashes`,
  },
  {
    name: "registry-validate",
    label: "Registry Validation",
    command: `"${NODE}" "${path.resolve(__dirname, "skill-profile-loader.mjs")}" validate`,
  },
  {
    name: "skill-consistency",
    label: "Skill Consistency (registry ↔ compound-engineering)",
    command: `"${NODE}" "${path.resolve(__dirname, "check-skill-consistency.mjs")}"`,
  },
  {
    name: "overlap-governance",
    label: "Overlap Governance Policy",
    command: `"${NODE}" "${path.resolve(__dirname, "check-skill-overlap-governance.mjs")}"`,
  },
  {
    name: "routing-evaluator",
    label: "Routing Quality Evaluation",
    command: `"${NODE}" "${path.resolve(__dirname, "skill-routing-evaluator.mjs")}" --tier-evidence "${tierEvidencePath}"${evaluatorFixtureArgs}`,
  },
  {
    name: "skill-implied-coverage",
    label: "Default-Tier Implied Coverage",
    command: `"${NODE}" "${path.resolve(__dirname, "check-skill-coverage.mjs")}" --tier-evidence "${tierEvidencePath}"`,
  },
]

// --- Runner ---
function writeEvidence(gateName, evidence) {
  if (!evidenceDir) return
  fs.mkdirSync(evidenceDir, { recursive: true })
  const filePath = path.join(evidenceDir, `${gateName}.json`)
  fs.writeFileSync(filePath, JSON.stringify(evidence, null, 2))
}

function run() {
  const startTime = Date.now()
  const results = []
  let allPassed = true

  console.log("=== Skill Routing Governance Gates ===\n")

  for (const gate of GATES) {
    const gateStart = Date.now()
    console.log(`[GATE] ${gate.label}`)
    console.log(`  cmd: ${gate.command}`)

    let stdout = ""
    let stderr = ""
    let exitCode = 0

    try {
      stdout = execSync(gate.command, {
        encoding: "utf8",
        timeout: 60_000,
        stdio: ["pipe", "pipe", "pipe"],
      })
      console.log(`  ${stdout.trim().split("\n").join("\n  ")}`)
      console.log(`  ✓ PASSED (${Date.now() - gateStart}ms)\n`)
    } catch (err) {
      exitCode = err.status || 1
      stdout = err.stdout || ""
      stderr = err.stderr || ""
      const output = (stderr || stdout).trim()
      if (output) {
        console.log(`  ${output.split("\n").join("\n  ")}`)
      }
      console.log(`  ✗ FAILED (exit ${exitCode}, ${Date.now() - gateStart}ms)\n`)
      allPassed = false
    }

    const evidence = {
      gate: gate.name,
      label: gate.label,
      exitCode,
      durationMs: Date.now() - gateStart,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      timestamp: new Date().toISOString(),
    }

    results.push(evidence)
    writeEvidence(gate.name, evidence)

    // In default (fail-fast) mode, stop on first failure.
    // In --full-report mode, continue running all gates.
    if (exitCode !== 0 && !fullReport) {
      break
    }
  }

  // --- Summary ---
  const totalMs = Date.now() - startTime
  const passedCount = results.filter((r) => r.exitCode === 0).length
  const failedCount = results.filter((r) => r.exitCode !== 0).length
  const skippedCount = GATES.length - results.length

  console.log("=== Summary ===")
  console.log(`  Mode:         ${fullReport ? "full-report" : "fail-fast"}`)
  console.log(`  Gates run:    ${results.length}/${GATES.length}`)
  console.log(`  Passed:       ${passedCount}`)
  console.log(`  Failed:       ${failedCount}`)
  if (skippedCount > 0) {
    console.log(`  Skipped:      ${skippedCount} (fail-fast after first failure)`)
  }
  console.log(`  Total time:   ${totalMs}ms`)

  // Write aggregate evidence
  if (evidenceDir) {
    writeEvidence("_summary", {
      mode: fullReport ? "full-report" : "fail-fast",
      allPassed,
      gatesRun: results.length,
      gatesTotal: GATES.length,
      passed: passedCount,
      failed: failedCount,
      skipped: skippedCount,
      totalMs,
      timestamp: new Date().toISOString(),
      gates: results.map((r) => ({
        gate: r.gate,
        exitCode: r.exitCode,
        durationMs: r.durationMs,
      })),
    })
  }

  if (!allPassed) {
    console.log("\n✗ GOVERNANCE GATES FAILED — resolve issues before merging.")
    process.exit(1)
  }

  console.log("\n✓ ALL GOVERNANCE GATES PASSED")
  process.exit(0)
}

// Export for testing
export { GATES }

// Only run CLI when this file is the entry point
const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(__filename) ||
  path.resolve(process.argv[1]) === path.resolve(__filename.replace(/\.mjs$/, ""))
)
if (isMain) {
  run()
}
