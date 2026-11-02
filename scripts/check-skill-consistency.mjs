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
const SKILLS_DIR = path.resolve(__dirname, "../opencode-config/skills")
const TIER_EVIDENCE_PATH = path.resolve(
  __dirname,
  "../.sisyphus/evidence/skill-classification-recommendations.json"
)

const REQUIRED_TIERS = ["default", "manual", "dormant", "candidate-prune"]

function listSkillIdsFromDisk(skillsDir) {
  const skillIds = []

  function walk(dirPath, relative = "") {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name)
      const relPath = relative ? `${relative}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        walk(fullPath, relPath)
        continue
      }

      if (entry.isFile() && entry.name === "SKILL.md") {
        const skillId = relative.replaceAll("\\", "/")
        if (skillId) {
          skillIds.push(skillId)
        }
      }
    }
  }

  walk(skillsDir)
  return skillIds.sort((a, b) => a.localeCompare(b))
}

function loadTierEvidence(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"))
  const tierRecommendations = raw?.tierRecommendations

  if (!tierRecommendations || typeof tierRecommendations !== "object") {
    throw new Error(`Missing tierRecommendations in evidence file: ${filePath}`)
  }

  for (const tier of REQUIRED_TIERS) {
    if (!Array.isArray(tierRecommendations[tier])) {
      throw new Error(
        `Tier '${tier}' missing or not an array in evidence file: ${filePath}`
      )
    }
  }

  const skillToTier = new Map()
  const duplicateAssignments = []

  for (const tier of REQUIRED_TIERS) {
    for (const skill of tierRecommendations[tier]) {
      if (skillToTier.has(skill)) {
        duplicateAssignments.push({
          skill,
          tiers: [skillToTier.get(skill), tier],
        })
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

function hasTierAssignment(skillId, skillToTier) {
  if (skillToTier.has(skillId)) {
    return true
  }
  const alias = skillId.includes("/") ? skillId.split("/").at(-1) : null
  return Boolean(alias && skillToTier.has(alias))
}

function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"))
  const compound = JSON.parse(fs.readFileSync(COMPOUND_PATH, "utf8"))
  const diskSkills = listSkillIdsFromDisk(SKILLS_DIR)
  const tierEvidence = loadTierEvidence(TIER_EVIDENCE_PATH)

  const registryKeys = new Set(Object.keys(registry.skills || {}))
  const enabledSkills = compound?.skills?.enabled || []
  const enabledSet = new Set(enabledSkills)

  const missing = enabledSkills.filter((skill) => !registryKeys.has(skill))
  const missingFromRegistryByTier = [...tierEvidence.skillToTier.keys()].filter(
    (skill) => !registryKeys.has(skill)
  )
  const untieredOnDisk = diskSkills.filter(
    (skill) => !hasTierAssignment(skill, tierEvidence.skillToTier)
  )
  const defaultTier = tierEvidence.tierRecommendations.default
  const defaultNotEnabled = defaultTier.filter((skill) => !enabledSet.has(skill))
  const enabledUntiered = enabledSkills.filter(
    (skill) => !hasTierAssignment(skill, tierEvidence.skillToTier)
  )

  const errors = []

  if (missing.length > 0) {
    errors.push(
      `${missing.length} enabled skill(s) missing from registry.json:\n${missing
        .map((skill) => `  - ${skill}`)
        .join("\n")}`
    )
  }

  if (tierEvidence.duplicateAssignments.length > 0) {
    errors.push(
      `Duplicate tier assignments in classification evidence:\n${tierEvidence.duplicateAssignments
        .map(({ skill, tiers }) => `  - ${skill}: ${tiers.join(" -> ")}`)
        .join("\n")}`
    )
  }

  if (missingFromRegistryByTier.length > 0) {
    errors.push(
      `Tier evidence references unknown registry skills:\n${missingFromRegistryByTier
        .map((skill) => `  - ${skill}`)
        .join("\n")}`
    )
  }

  if (untieredOnDisk.length > 0) {
    errors.push(
      `Untiered on-disk skills found (governance requires explicit tiering):\n${untieredOnDisk
        .map((skill) => `  - ${skill}`)
        .join("\n")}`
    )
  }

  if (defaultNotEnabled.length > 0) {
    errors.push(
      `Default-tier skills must remain baseline-enabled in compound-engineering.json:\n${defaultNotEnabled
        .map((skill) => `  - ${skill}`)
        .join("\n")}`
    )
  }

  if (enabledUntiered.length > 0) {
    errors.push(
      `Enabled skills missing explicit tier assignment:\n${enabledUntiered
        .map((skill) => `  - ${skill}`)
        .join("\n")}`
    )
  }

  if (errors.length > 0) {
    console.error("Skill consistency check FAILED")
    for (const error of errors) {
      console.error(error)
    }
    process.exit(1)
  }

  console.log("Skill consistency check passed")
  console.log(
    `Enabled skills in registry: ${enabledSkills.length}/${enabledSkills.length} ` +
    `(${registryKeys.size} total registry skills)`
  )
  console.log(`On-disk skills explicitly tiered: ${diskSkills.length}/${diskSkills.length}`)
  console.log(`Default tier allowlist size: ${defaultTier.length}`)
  console.log(`Tier evidence source: ${path.relative(process.cwd(), TIER_EVIDENCE_PATH)}`)
  process.exit(0)
}

main()
