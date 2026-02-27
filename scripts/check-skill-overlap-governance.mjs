#!/usr/bin/env node

/**
 * check-skill-overlap-governance.mjs
 *
 * Validates overlap governance policy for the skill registry:
 *
 * 1. Every skill with `overlapCluster` belongs to a cluster that has
 *    exactly ONE skill with `canonicalEntrypoint: true`.
 * 2. Every skill in an overlap cluster has a non-empty `selectionHints.avoidWhen`.
 * 3. All `conflicts` references resolve to known skills in the registry.
 *
 * Exit 0 = governance checks pass
 * Exit 1 = policy violations found (details to stderr)
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const REGISTRY_PATH = path.resolve(__dirname, "../opencode-config/skills/registry.json")

function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"))
  const skills = registry.skills || {}
  const skillNames = new Set(Object.keys(skills))
  const errors = []

  // --- 1. Build cluster map and validate canonical entrypoints ---
  // Map: clusterName -> { skills: [name, ...], canonicals: [name, ...] }
  const clusters = {}

  for (const [name, skill] of Object.entries(skills)) {
    if (!skill.overlapCluster) continue

    const cluster = skill.overlapCluster
    if (!clusters[cluster]) {
      clusters[cluster] = { skills: [], canonicals: [] }
    }
    clusters[cluster].skills.push(name)

    if (skill.canonicalEntrypoint === true) {
      clusters[cluster].canonicals.push(name)
    }
  }

  for (const [clusterName, info] of Object.entries(clusters)) {
    if (info.canonicals.length === 0) {
      errors.push(
        `Cluster '${clusterName}' has no canonical entrypoint. ` +
        `Skills in cluster: [${info.skills.join(", ")}]`
      )
    } else if (info.canonicals.length > 1) {
      errors.push(
        `Cluster '${clusterName}' has ${info.canonicals.length} canonical entrypoints ` +
        `(must be exactly 1): [${info.canonicals.join(", ")}]`
      )
    }
  }

  // --- 2. Every skill in an overlap cluster must have non-empty avoidWhen ---
  for (const [name, skill] of Object.entries(skills)) {
    if (!skill.overlapCluster) continue

    const avoidWhen = skill.selectionHints?.avoidWhen
    if (!avoidWhen || !Array.isArray(avoidWhen) || avoidWhen.length === 0) {
      errors.push(
        `Skill '${name}' in cluster '${skill.overlapCluster}' ` +
        `is missing non-empty selectionHints.avoidWhen`
      )
    }
  }

  // --- 3. All conflict references must resolve to known skills ---
  for (const [name, skill] of Object.entries(skills)) {
    for (const conflict of skill.conflicts || []) {
      if (!skillNames.has(conflict)) {
        errors.push(
          `Skill '${name}' has unresolved conflict reference: '${conflict}'`
        )
      }
    }
  }

  // --- Report ---
  if (errors.length > 0) {
    console.error("Overlap governance check FAILED")
    console.error(`${errors.length} violation(s) found:\n`)
    for (const err of errors) {
      console.error(`  - ${err}`)
    }
    process.exit(1)
  }

  // Summary output
  const clusterCount = Object.keys(clusters).length
  const clusteredSkillCount = Object.values(clusters).reduce((sum, c) => sum + c.skills.length, 0)

  console.log("Overlap governance check passed")
  console.log(`  Clusters: ${clusterCount}`)
  for (const [clusterName, info] of Object.entries(clusters)) {
    console.log(`    ${clusterName}: [${info.skills.join(", ")}] canonical=${info.canonicals[0]}`)
  }
  console.log(`  Total clustered skills: ${clusteredSkillCount}`)
  console.log(`  All conflict references resolved: yes`)
  console.log(`  All clustered skills have avoidWhen: yes`)
  process.exit(0)
}

main()
