#!/usr/bin/env node

/**
 * check-skill-consistency.mjs
 *
 * Verifies that every skill listed in compound-engineering.json skills.enabled[]
 * exists as a key in registry.json skills{}.
 *
 * Canonical rule: registry.json is the single source of truth.
 * compound-engineering.json enabled[] must be a strict subset of registry keys.
 *
 * Exit 0 = consistent
 * Exit 1 = divergence found (missing skills listed to stderr)
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const REGISTRY_PATH = path.resolve(__dirname, "../opencode-config/skills/registry.json")
const COMPOUND_PATH = path.resolve(__dirname, "../opencode-config/compound-engineering.json")

function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"))
  const compound = JSON.parse(fs.readFileSync(COMPOUND_PATH, "utf8"))

  const registryKeys = new Set(Object.keys(registry.skills || {}))
  const enabledSkills = compound?.skills?.enabled || []

  const missing = enabledSkills.filter((skill) => !registryKeys.has(skill))

  if (missing.length > 0) {
    console.error("Skill consistency check FAILED")
    console.error(`${missing.length} enabled skill(s) missing from registry.json:`)
    for (const skill of missing) {
      console.error(`  - ${skill}`)
    }
    process.exit(1)
  }

  console.log("Skill consistency check passed")
  console.log(`All ${enabledSkills.length} enabled skills found in registry (${registryKeys.size} total registry keys)`)
  process.exit(0)
}

main()
