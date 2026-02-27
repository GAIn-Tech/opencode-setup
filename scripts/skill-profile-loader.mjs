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

// --- Hierarchical scoring helpers (Task 2) ---

/**
 * Score each process phase by matching taskText against triggers and selectionHints
 * of skills annotated with that phase. Returns sorted array of { phase, score } with
 * deterministic tie-break by name. Top entry is winner.
 */
function scoreProcessPhase(taskText, registry) {
  const text = normalize(taskText)
  const phaseScores = {}

  for (const [skillName, skill] of Object.entries(registry.skills)) {
    if (!skill.processPhase) continue
    const phase = skill.processPhase
    if (!phaseScores[phase]) phaseScores[phase] = 0

    for (const trigger of skill.triggers || []) {
      if (text.includes(normalize(trigger))) {
        phaseScores[phase] += 2
      }
    }

    const hints = skill.selectionHints || {}
    for (const hint of hints.useWhen || []) {
      if (text.includes(normalize(hint))) {
        phaseScores[phase] += 3
      }
    }
    for (const hint of hints.avoidWhen || []) {
      if (text.includes(normalize(hint))) {
        phaseScores[phase] -= 2
      }
    }
  }

  const sorted = Object.entries(phaseScores)
    .map(([phase, score]) => ({ phase, score }))
    .sort((a, b) => b.score - a.score || a.phase.localeCompare(b.phase))

  return sorted
}

/**
 * Score each domain within the given processPhase. Returns sorted array of
 * { domain, score } with deterministic tie-break by name.
 */
function scoreDomain(taskText, phase, registry) {
  const text = normalize(taskText)
  const domainScores = {}

  for (const [skillName, skill] of Object.entries(registry.skills)) {
    if (!skill.domain) continue
    if (phase && skill.processPhase !== phase) continue
    const domain = skill.domain
    if (!domainScores[domain]) domainScores[domain] = 0

    for (const trigger of skill.triggers || []) {
      if (text.includes(normalize(trigger))) {
        domainScores[domain] += 2
      }
    }

    const hints = skill.selectionHints || {}
    for (const hint of hints.useWhen || []) {
      if (text.includes(normalize(hint))) {
        domainScores[domain] += 3
      }
    }
    for (const hint of hints.avoidWhen || []) {
      if (text.includes(normalize(hint))) {
        domainScores[domain] -= 2
      }
    }
  }

  const sorted = Object.entries(domainScores)
    .map(([domain, score]) => ({ domain, score }))
    .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain))

  return sorted
}

/**
 * Score individual skills within given phase+domain. Returns sorted array of
 * { skill, score } with deterministic tie-break by skill name.
 */
function scoreSkills(taskText, phase, domain, registry) {
  const text = normalize(taskText)
  const results = []

  for (const [skillName, skill] of Object.entries(registry.skills)) {
    if (phase && skill.processPhase && skill.processPhase !== phase) continue
    if (domain && skill.domain && skill.domain !== domain) continue
    if (phase && !skill.processPhase) continue
    if (domain && !skill.domain) continue

    let score = 0

    for (const trigger of skill.triggers || []) {
      if (text.includes(normalize(trigger))) {
        score += 2
      }
    }

    const hints = skill.selectionHints || {}
    for (const hint of hints.useWhen || []) {
      if (text.includes(normalize(hint))) {
        score += 3
      }
    }
    for (const hint of hints.avoidWhen || []) {
      if (text.includes(normalize(hint))) {
        score -= 2
      }
    }

    if (score > 0) {
      results.push({ skill: skillName, score })
    }
  }

  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score

    const aSkill = registry.skills[a.skill] || {}
    const bSkill = registry.skills[b.skill] || {}
    const aCanonical = aSkill.canonicalEntrypoint === true
    const bCanonical = bSkill.canonicalEntrypoint === true

    if (aCanonical !== bCanonical) {
      return bCanonical ? 1 : -1
    }

    return a.skill.localeCompare(b.skill)
  })
}

/**
 * Full hierarchical routing: phase -> domain -> skill.
 * Returns winner/runnerUp at each level and ambiguity margin.
 */
function routeHierarchical(taskText, registry) {
  const phases = scoreProcessPhase(taskText, registry)
  const winningPhase = phases[0] || null
  const runnerUpPhase = phases[1] || null

  const phaseName = winningPhase ? winningPhase.phase : null

  const domains = scoreDomain(taskText, phaseName, registry)
  const winningDomain = domains[0] || null
  const runnerUpDomain = domains[1] || null

  const domainName = winningDomain ? winningDomain.domain : null

  const skills = scoreSkills(taskText, phaseName, domainName, registry)
  const topSkill = skills[0] || null
  const runnerUpSkill = skills[1] || null

  const ambiguityMargin = (topSkill && runnerUpSkill)
    ? topSkill.score - runnerUpSkill.score
    : (topSkill ? topSkill.score : 0)

  return {
    processPhase: winningPhase,
    runnerUpPhase,
    domain: winningDomain,
    runnerUpDomain,
    topSkill,
    runnerUpSkill,
    ambiguityMargin,
    allPhases: phases,
    allDomains: domains,
    allSkills: skills,
  }
}

// --- End hierarchical scoring helpers ---

function printUsage() {
  console.log("Usage:")
  console.log("  node scripts/skill-profile-loader.mjs profile <profile-name>")
  console.log("  node scripts/skill-profile-loader.mjs recommend \"<task description>\" [limit]")
  console.log("  node scripts/skill-profile-loader.mjs validate")
  console.log("  node scripts/skill-profile-loader.mjs route \"<task description>\"")
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

    // Enrich with optional hierarchical diagnostics
    const routing = routeHierarchical(text, registry)
    const enriched = recommendations.map((rec) => ({
      ...rec,
      processPhase: routing.processPhase ? routing.processPhase.phase : null,
      domain: routing.domain ? routing.domain.domain : null,
      topSkill: routing.topSkill ? routing.topSkill.skill : null,
      runnerUpSkill: routing.runnerUpSkill ? routing.runnerUpSkill.skill : null,
      ambiguityMargin: routing.ambiguityMargin,
    }))

    console.log(JSON.stringify(enriched, null, 2))
    process.exit(0)
  }

  if (command === "route") {
    const text = args[0]
    if (!text) {
      printUsage()
      process.exit(1)
    }
    const result = routeHierarchical(text, registry)
    console.log(JSON.stringify(result, null, 2))
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

// Exports for testing and evaluator usage
export {
  normalize,
  loadRegistry,
  resolveSkillsWithDependencies,
  recommendProfiles,
  loadProfile,
  validateRegistry,
  scoreProcessPhase,
  scoreDomain,
  scoreSkills,
  routeHierarchical,
}

// Only run CLI when this file is the entry point
const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(__filename) ||
  path.resolve(process.argv[1]) === path.resolve(__filename.replace(/\.mjs$/, ""))
)
if (isMain) {
  main(process.argv.slice(2))
}
