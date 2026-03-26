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
 * 4. No circular dependency chains exist among skills.
 * 5. Transitive conflict warnings: if A conflicts B and B conflicts C,
 *    warn about potential A+C incompatibility.
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

/**
 * Detect circular dependency chains in skills.
 * Uses DFS with coloring (white/gray/black) for cycle detection.
 *
 * @param {Object<string, {dependencies?: string[]}>} skills
 * @returns {string[][]} Array of cycles, each cycle is an array of skill names
 */
export function detectCircularDependencies(skills) {
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = {}
  const cycles = []

  for (const name of Object.keys(skills)) {
    color[name] = WHITE
  }

  function dfs(node, path) {
    color[node] = GRAY
    path.push(node)

    const deps = skills[node]?.dependencies || []
    for (const dep of deps) {
      if (!(dep in skills)) continue // skip unresolved refs (checked elsewhere)

      if (color[dep] === GRAY) {
        // Found cycle: extract the cycle portion from path
        const cycleStart = path.indexOf(dep)
        const cycle = path.slice(cycleStart).concat(dep)
        cycles.push(cycle)
      } else if (color[dep] === WHITE) {
        dfs(dep, path)
      }
    }

    path.pop()
    color[node] = BLACK
  }

  for (const name of Object.keys(skills)) {
    if (color[name] === WHITE) {
      dfs(name, [])
    }
  }

  return cycles
}

/**
 * Detect transitive conflict warnings.
 * If skill A conflicts with B and B conflicts with C,
 * warn that A and C may be incompatible via transitive conflict through B.
 *
 * @param {Object<string, {conflicts?: string[]}>} skills
 * @returns {string[]} Array of warning messages
 */
export function detectTransitiveConflicts(skills) {
  const warnings = []
  const seen = new Set()

  for (const [name, skill] of Object.entries(skills)) {
    for (const directConflict of skill.conflicts || []) {
      if (!(directConflict in skills)) continue

      // Check what directConflict also conflicts with
      for (const transitive of skills[directConflict]?.conflicts || []) {
        if (transitive === name) continue // skip self (A→B→A is just mutual conflict)
        if (!(transitive in skills)) continue

        // Check that `name` doesn't already directly conflict with `transitive`
        const nameConflicts = skill.conflicts || []
        if (nameConflicts.includes(transitive)) continue

        // Deduplicate: sort pair to avoid A+C and C+A
        const pair = [name, transitive].sort().join('+')
        const key = `${pair}:${directConflict}`
        if (seen.has(key)) continue
        seen.add(key)

        warnings.push(
          `Transitive conflict: '${name}' conflicts '${directConflict}' ` +
          `and '${directConflict}' conflicts '${transitive}' — ` +
          `'${name}' and '${transitive}' may be incompatible`
        )
      }
    }
  }

  return warnings
}

function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"))
  const skills = registry.skills || {}
  const skillNames = new Set(Object.keys(skills))
  const errors = []
  const warnings = []

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

  // --- 4. Circular dependency detection ---
  const cycles = detectCircularDependencies(skills)
  for (const cycle of cycles) {
    errors.push(
      `Circular dependency detected: ${cycle.join(" → ")}`
    )
  }

  // --- 5. Transitive conflict warnings ---
  const transitiveWarnings = detectTransitiveConflicts(skills)
  for (const w of transitiveWarnings) {
    warnings.push(w)
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
  console.log(`  Total skills checked: ${Object.keys(skills).length}`)
  console.log(`  All conflict references resolved: yes`)
  console.log(`  All clustered skills have avoidWhen: yes`)
  console.log(`  Circular dependencies: none`)
  if (warnings.length > 0) {
    console.log(`  Transitive conflict warnings: ${warnings.length}`)
    for (const w of warnings) {
      console.log(`    ⚠ ${w}`)
    }
  } else {
    console.log(`  Transitive conflict warnings: none`)
  }
  process.exit(0)
}

if (import.meta.main) {
  main()
}
