#!/usr/bin/env node

/**
 * validate-skill-import.mjs
 *
 * Validates consistency between registry.json and SKILL.md files:
 *
 * 1. Every skill in registry.json has a corresponding SKILL.md file
 * 2. Every SKILL.md file in skills/ has a registry entry
 * 3. Synergy references are bidirectional (if A lists B, B should list A)
 * 4. Dependency references don't form cycles
 *
 * Exit 0 = all validations pass
 * Exit 1 = validation failures found (details to stderr)
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT = path.resolve(__dirname, "..")
const SKILLS_DIR = path.join(ROOT, "opencode-config", "skills")
const REGISTRY_PATH = path.join(SKILLS_DIR, "registry.json")

// Skills that are meta/builtin and don't need SKILL.md files on disk
const EXEMPT_SKILLS = new Set([
  "agent-browser", // builtin, no SKILL.md
])

// Directories that are not skills
const EXCLUDED_DIRS = new Set([
  "semantic-matching",
  "superpowers",
])

/**
 * Find SKILL.md files that have no registry entry.
 * @param {Object} registrySkills - skills object from registry.json
 * @param {string[]} skillFiles - skill directory names with SKILL.md
 * @returns {string[]} orphan skill file names
 */
export function detectOrphanSkillFiles(registrySkills, skillFiles) {
  return skillFiles.filter(name => !(name in registrySkills))
}

/**
 * Find registry entries that have no SKILL.md file.
 * @param {Object} registrySkills - skills object from registry.json
 * @param {string[]} skillFiles - skill directory names with SKILL.md
 * @returns {string[]} orphan registry entry names
 */
export function detectOrphanRegistryEntries(registrySkills, skillFiles) {
  const fileSet = new Set(skillFiles)
  return Object.keys(registrySkills).filter(name =>
    !fileSet.has(name) && !EXEMPT_SKILLS.has(name)
  )
}

/**
 * Detect synergy references that are not bidirectional.
 * @param {Object<string, {synergies?: string[]}>} skills
 * @returns {string[]} violation messages
 */
export function detectNonBidirectionalSynergies(skills) {
  const violations = []
  const seen = new Set()

  for (const [name, skill] of Object.entries(skills)) {
    for (const synergy of skill.synergies || []) {
      if (!(synergy in skills)) continue // skip unresolved refs

      const otherSynergies = skills[synergy]?.synergies || []
      if (!otherSynergies.includes(name)) {
        const key = `${name}→${synergy}`
        if (seen.has(key)) continue
        seen.add(key)

        violations.push(
          `Non-bidirectional synergy: '${name}' lists '${synergy}' as synergy, ` +
          `but '${synergy}' does not list '${name}'`
        )
      }
    }
  }

  return violations
}

/**
 * Detect cycles in dependency graph.
 * @param {Object<string, {dependencies?: string[]}>} skills
 * @returns {string[][]} Array of cycles
 */
export function detectDependencyCycles(skills) {
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
      if (!(dep in skills)) continue

      if (color[dep] === GRAY) {
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
 * Discover all skill directory names that have a SKILL.md file.
 * Scans top-level dirs + superpowers/ subdirs.
 * @param {string} skillsDir
 * @returns {string[]}
 */
function discoverSkillFileNames(skillsDir) {
  const names = []

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith(".")) continue
    if (EXCLUDED_DIRS.has(entry.name)) {
      // Check superpowers subdirectory
      if (entry.name === "superpowers") {
        const spDir = path.join(skillsDir, "superpowers")
        if (fs.existsSync(spDir)) {
          const spEntries = fs.readdirSync(spDir, { withFileTypes: true })
          for (const sp of spEntries) {
            if (!sp.isDirectory()) continue
            if (fs.existsSync(path.join(spDir, sp.name, "SKILL.md"))) {
              names.push(sp.name)
            }
          }
        }
      }
      continue
    }

    if (fs.existsSync(path.join(skillsDir, entry.name, "SKILL.md"))) {
      names.push(entry.name)
    }
  }

  return names
}

function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"))
  const skills = registry.skills || {}
  const errors = []
  const warnings = []

  // Discover SKILL.md files on disk
  const skillFiles = discoverSkillFileNames(SKILLS_DIR)

  // --- 1. Registry entries without SKILL.md ---
  const orphanRegistry = detectOrphanRegistryEntries(skills, skillFiles)
  for (const name of orphanRegistry) {
    warnings.push(`Registry entry '${name}' has no corresponding SKILL.md file`)
  }

  // --- 2. SKILL.md files without registry entry ---
  const orphanFiles = detectOrphanSkillFiles(skills, skillFiles)
  for (const name of orphanFiles) {
    warnings.push(`SKILL.md for '${name}' has no registry entry`)
  }

  // --- 3. Bidirectional synergy validation ---
  const synergyViolations = detectNonBidirectionalSynergies(skills)
  // Synergy violations are warnings, not errors (many imported skills have asymmetric synergies)
  for (const v of synergyViolations) {
    warnings.push(v)
  }

  // --- 4. Dependency cycle detection ---
  const cycles = detectDependencyCycles(skills)
  for (const cycle of cycles) {
    errors.push(`Dependency cycle detected: ${cycle.join(" → ")}`)
  }

  // --- Report ---
  if (errors.length > 0) {
    console.error("Skill import validation FAILED")
    console.error(`${errors.length} error(s) found:\n`)
    for (const err of errors) {
      console.error(`  ✗ ${err}`)
    }
    if (warnings.length > 0) {
      console.error(`\n${warnings.length} warning(s):\n`)
      for (const w of warnings) {
        console.error(`  ⚠ ${w}`)
      }
    }
    process.exit(1)
  }

  console.log("Skill import validation passed")
  console.log(`  Registry skills: ${Object.keys(skills).length}`)
  console.log(`  SKILL.md files: ${skillFiles.length}`)
  console.log(`  Orphan registry entries: ${orphanRegistry.length}`)
  console.log(`  Orphan SKILL.md files: ${orphanFiles.length}`)
  console.log(`  Dependency cycles: none`)
  if (warnings.length > 0) {
    console.log(`  Warnings: ${warnings.length}`)
    for (const w of warnings) {
      console.log(`    ⚠ ${w}`)
    }
  } else {
    console.log(`  Warnings: none`)
  }
  process.exit(0)
}

if (import.meta.main) {
  main()
}
