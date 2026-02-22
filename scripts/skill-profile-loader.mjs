#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, "../opencode-config/skills/registry.json")

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
}

function loadRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  const raw = fs.readFileSync(registryPath, "utf8")
  const data = JSON.parse(raw)
  if (!data || !data.skills || !data.profiles) {
    throw new Error(`Invalid registry format: ${registryPath}`)
  }
  return data
}

function resolveSkillsWithDependencies(skillNames, registry) {
  const ordered = []
  const visiting = new Set()
  const visited = new Set()
  const conflicts = []

  function visit(skillName, chain = []) {
    if (!registry.skills[skillName]) {
      throw new Error(`Unknown skill: ${skillName} (dependency chain: ${chain.join(" -> ") || "root"})`)
    }
    if (visited.has(skillName)) return
    if (visiting.has(skillName)) {
      throw new Error(`Cyclic dependency detected: ${[...chain, skillName].join(" -> ")}`)
    }

    visiting.add(skillName)
    const deps = registry.skills[skillName].dependencies || []
    for (const dep of deps) {
      visit(dep, [...chain, skillName])
    }
    visiting.delete(skillName)

    visited.add(skillName)
    ordered.push(skillName)
  }

  for (const skillName of skillNames) {
    visit(skillName)
  }

  const selected = new Set(ordered)
  for (const skillName of ordered) {
    const skill = registry.skills[skillName]
    const incompatible = skill.conflicts || []
    for (const other of incompatible) {
      if (selected.has(other)) {
        conflicts.push({ skill: skillName, conflictsWith: other })
      }
    }
  }

  return {
    skills: ordered,
    conflicts,
  }
}

function recommendProfiles(taskDescription, registry, limit = 3) {
  const text = normalize(taskDescription)
  const scored = []

  for (const [profileName, profile] of Object.entries(registry.profiles)) {
    let score = 0
    const matched = []

    for (const trigger of profile.triggers || []) {
      if (text.includes(normalize(trigger))) {
        score += 3
        matched.push(`profile:${trigger}`)
      }
    }

    for (const skillName of profile.skills || []) {
      const skill = registry.skills[skillName]
      if (!skill) continue

      for (const trigger of skill.triggers || []) {
        if (text.includes(normalize(trigger))) {
          score += 1
          matched.push(`${skillName}:${trigger}`)
        }
      }
    }

    if (score > 0) {
      scored.push({
        profile: profileName,
        score,
        description: profile.description,
        matched,
      })
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}

function loadProfile(profileName, registry) {
  const profile = registry.profiles[profileName]
  if (!profile) {
    throw new Error(`Unknown profile: ${profileName}`)
  }
  const resolution = resolveSkillsWithDependencies(profile.skills || [], registry)
  return {
    profile: profileName,
    description: profile.description,
    requestedSkills: profile.skills || [],
    resolvedSkills: resolution.skills,
    conflicts: resolution.conflicts,
  }
}

function printUsage() {
  console.log("Usage:")
  console.log("  node scripts/skill-profile-loader.mjs profile <profile-name>")
  console.log("  node scripts/skill-profile-loader.mjs recommend \"<task description>\" [limit]")
  console.log("  node scripts/skill-profile-loader.mjs validate")
}

function validateRegistry(registry) {
  const errors = []

  for (const [skillName, skill] of Object.entries(registry.skills)) {
    for (const dep of skill.dependencies || []) {
      if (!registry.skills[dep]) {
        errors.push(`Skill '${skillName}' has unknown dependency '${dep}'`)
      }
    }
    for (const conflict of skill.conflicts || []) {
      if (!registry.skills[conflict]) {
        errors.push(`Skill '${skillName}' has unknown conflict '${conflict}'`)
      }
    }
  }

  for (const [profileName, profile] of Object.entries(registry.profiles)) {
    for (const skillName of profile.skills || []) {
      if (!registry.skills[skillName]) {
        errors.push(`Profile '${profileName}' references unknown skill '${skillName}'`)
      }
    }
  }

  return errors
}

function main(argv) {
  const [command, ...args] = argv
  if (!command) {
    printUsage()
    process.exit(1)
  }

  const registry = loadRegistry()

  if (command === "profile") {
    const profileName = args[0]
    if (!profileName) {
      printUsage()
      process.exit(1)
    }
    const result = loadProfile(profileName, registry)
    console.log(JSON.stringify(result, null, 2))
    process.exit(0)
  }

  if (command === "recommend") {
    const text = args[0]
    const limit = Number(args[1] || 3)
    if (!text) {
      printUsage()
      process.exit(1)
    }
    const recommendations = recommendProfiles(text, registry, limit)
    console.log(JSON.stringify(recommendations, null, 2))
    process.exit(0)
  }

  if (command === "validate") {
    const errors = validateRegistry(registry)
    if (errors.length > 0) {
      for (const error of errors) console.error(error)
      process.exit(1)
    }
    console.log("Registry validation passed")
    process.exit(0)
  }

  printUsage()
  process.exit(1)
}

main(process.argv.slice(2))
