#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { scoreSkills } from "./skill-profile-loader.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DEFAULT_ROOT = path.resolve(__dirname, "..")
const DEFAULT_REGISTRY = path.resolve(DEFAULT_ROOT, "opencode-config/skills/registry.json")
const DEFAULT_SKILLS_DIR = path.resolve(DEFAULT_ROOT, "opencode-config/skills")
const DEFAULT_TIER_EVIDENCE = path.resolve(
  DEFAULT_ROOT,
  ".sisyphus/evidence/skill-classification-recommendations.json"
)
const DEFAULT_REPORT = path.resolve(DEFAULT_ROOT, ".sisyphus/reports/skill-coverage-gap-report.json")
const DEFAULT_DYNAMIC_MATRIX_TEST = "scripts/tests/skill-implied-full-coverage.test.mjs"
const REQUIRED_TIERS = ["default", "manual", "dormant", "candidate-prune"]

const TEST_FILE_PATTERN = /\.(test|spec)\.(js|mjs|cjs|ts|tsx)$/i
const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", ".worktrees"])

function parseArgs(argv = process.argv.slice(2)) {
  let rootDir = DEFAULT_ROOT
  let registryPath = DEFAULT_REGISTRY
  let skillsDir = DEFAULT_SKILLS_DIR
  let tierEvidencePath = DEFAULT_TIER_EVIDENCE
  let reportPath = null
  let jsonOutput = false
  let strict = true

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--root" && argv[i + 1]) {
      rootDir = path.resolve(argv[++i])
    } else if (arg === "--registry" && argv[i + 1]) {
      registryPath = path.resolve(argv[++i])
    } else if (arg === "--skills-dir" && argv[i + 1]) {
      skillsDir = path.resolve(argv[++i])
    } else if (arg === "--tier-evidence" && argv[i + 1]) {
      tierEvidencePath = path.resolve(argv[++i])
    } else if (arg === "--report" && argv[i + 1]) {
      reportPath = path.resolve(argv[++i])
    } else if (arg === "--json") {
      jsonOutput = true
    } else if (arg === "--no-strict") {
      strict = false
    }
  }

  return { rootDir, registryPath, skillsDir, tierEvidencePath, reportPath, jsonOutput, strict }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim()
}

function loadRegistry(registryPath) {
  const data = JSON.parse(fs.readFileSync(registryPath, "utf8"))
  if (!data || typeof data !== "object" || !data.skills) {
    throw new Error(`Invalid registry file format: ${registryPath}`)
  }
  return data
}

function loadTierEvidence(tierEvidencePath) {
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

function resolveTierForSkill(skillId, skillToTier) {
  if (skillToTier.has(skillId)) {
    return skillToTier.get(skillId)
  }
  const alias = skillId.includes("/") ? skillId.split("/").at(-1) : null
  if (alias && skillToTier.has(alias)) {
    return skillToTier.get(alias)
  }
  return null
}

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

function listTestFiles(rootDir) {
  const files = []

  function walk(dirPath) {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walk(path.join(dirPath, entry.name))
        continue
      }

      const fullPath = path.join(dirPath, entry.name)
      if (TEST_FILE_PATTERN.test(fullPath)) {
        files.push(fullPath)
      }
    }
  }

  walk(rootDir)
  return files
}

function buildExplicitPatterns(skillName) {
  const escaped = escapeRegex(skillName)
  return [
    new RegExp(`load_skills\\s*:\\s*\\[[^\\]]*["']${escaped}["']`, "i"),
    new RegExp(`skills\\s*:\\s*\\[[^\\]]*["']${escaped}["']`, "i"),
    new RegExp(`slashcommand\\s*\\(\\s*\\{[^}]*command\\s*:\\s*["'][^"']*\\/${escaped}["']`, "i"),
  ]
}

function buildImpliedNamePatterns(skillName) {
  const escaped = escapeRegex(skillName)
  return [
    new RegExp(`expectedTopSkill\\s*[:=]\\s*["']${escaped}["']`, "i"),
    new RegExp(`topSkill\\s*[:=]\\s*["']${escaped}["']`, "i"),
    new RegExp(`to(?:Be|Contain|Equal)\\s*\\(\\s*["']${escaped}["']`, "i"),
    new RegExp(`includes\\s*\\(\\s*["']${escaped}["']`, "i"),
  ]
}

function hasRoutingContext(content) {
  const routingSignals = [
    "routehierarchical",
    "recommendprofiles",
    "skill-profile-loader",
    "expectedtopskill",
    "topskill",
    "profile",
    "orchestrator",
    "skill-routing",
    "triggers",
  ]

  return routingSignals.some((signal) => content.includes(signal))
}

function collectEvidenceForSkill(skillName, skillMeta, indexedFiles, aliases = []) {
  const names = [skillName, ...aliases].filter(Boolean)
  const explicitPatterns = names.flatMap((name) => buildExplicitPatterns(name))
  const impliedPatterns = names.flatMap((name) => buildImpliedNamePatterns(name))
  const normalizedTriggers = (skillMeta.triggers || [])
    .map((trigger) => normalizeText(trigger))
    .filter((trigger) => trigger.length >= 4)

  const explicit = []
  const implied = []

  for (const file of indexedFiles) {
    const { filePath, content } = file
    const explicitMatch = explicitPatterns.some((pattern) => pattern.test(content))
    if (explicitMatch) {
      explicit.push({ file: filePath, reason: "explicit skill load/call" })
    }

    const impliedByName = impliedPatterns.some((pattern) => pattern.test(content))
    if (impliedByName) {
      implied.push({ file: filePath, reason: "implied by routing/profile assertion" })
      continue
    }

    if (!hasRoutingContext(content)) {
      continue
    }

    const matchedTrigger = normalizedTriggers.find((trigger) => content.includes(trigger))
    if (matchedTrigger) {
      implied.push({ file: filePath, reason: `implied by trigger phrase: ${matchedTrigger}` })
    }
  }

  const impliedFiles = [...new Set(implied.map((entry) => entry.file))]
  const explicitFiles = [...new Set(explicit.map((entry) => entry.file))]

  return {
    implied,
    explicit,
    impliedFiles,
    explicitFiles,
    pass: impliedFiles.length > 0,
  }
}

function buildDynamicPrompt(meta, fallbackSkillId) {
  const triggers = (meta?.triggers || [])
    .filter((trigger) => typeof trigger === "string" && trigger.trim().length > 0)
    .slice(0, 3)

  if (triggers.length > 0) {
    return triggers.join(" and ")
  }

  if (typeof meta?.description === "string" && meta.description.trim().length > 0) {
    return meta.description
  }

  return `use ${fallbackSkillId}`
}

function analyzeCoverage({
  rootDir,
  registryPath = path.resolve(rootDir, "opencode-config/skills/registry.json"),
  skillsDir = path.resolve(rootDir, "opencode-config/skills"),
  tierEvidencePath = path.resolve(rootDir, ".sisyphus/evidence/skill-classification-recommendations.json"),
}) {
  const registry = loadRegistry(registryPath)
  const tierEvidence = loadTierEvidence(tierEvidencePath)
  const skillIds = listSkillIdsFromDisk(skillsDir)
  const untieredSkills = skillIds
    .filter((skill) => !resolveTierForSkill(skill, tierEvidence.skillToTier))
    .sort((a, b) => a.localeCompare(b))
  const defaultSkills = skillIds
    .filter((skill) => resolveTierForSkill(skill, tierEvidence.skillToTier) === "default")
    .sort((a, b) => a.localeCompare(b))
  const nonDefaultSkillsByTier = {
    manual: skillIds.filter((skill) => resolveTierForSkill(skill, tierEvidence.skillToTier) === "manual").length,
    dormant: skillIds.filter((skill) => resolveTierForSkill(skill, tierEvidence.skillToTier) === "dormant").length,
    "candidate-prune": skillIds.filter((skill) => resolveTierForSkill(skill, tierEvidence.skillToTier) === "candidate-prune").length,
  }

  const dynamicMatrixRelativePath = DEFAULT_DYNAMIC_MATRIX_TEST.replaceAll("\\", "/")
  const dynamicMatrixAbsolutePath = path.resolve(rootDir, DEFAULT_DYNAMIC_MATRIX_TEST)
  const hasDynamicMatrixTest = fs.existsSync(dynamicMatrixAbsolutePath)
  const testFiles = listTestFiles(rootDir)
  const indexedFiles = testFiles.map((filePath) => ({
    filePath: path.relative(rootDir, filePath).replaceAll("\\", "/"),
    content: normalizeText(fs.readFileSync(filePath, "utf8")),
  }))

  const skills = {}
  let passed = 0
  let failed = 0

  for (const skillId of defaultSkills) {
    const alias = skillId.includes("/") ? skillId.split("/").at(-1) : null
    const skillMeta = registry.skills[skillId] || registry.skills[alias] || { triggers: [] }
    const evidence = collectEvidenceForSkill(skillId, skillMeta, indexedFiles, [alias])

    if (!evidence.pass && hasDynamicMatrixTest) {
      const prompt = buildDynamicPrompt(skillMeta, skillId)
      const ranked = scoreSkills(prompt, null, null, registry)
      const rankedNames = new Set(ranked.map((entry) => entry.skill))
      const dynamicHit = rankedNames.has(skillId) || (alias && rankedNames.has(alias))

      if (dynamicHit) {
        evidence.pass = true
        evidence.implied.push({
          file: dynamicMatrixRelativePath,
          reason: "implied by dynamic matrix routing assertion",
        })
        evidence.impliedFiles = [...new Set([...evidence.impliedFiles, dynamicMatrixRelativePath])]
      }
    }

    skills[skillId] = {
      pass: evidence.pass,
      impliedFiles: evidence.impliedFiles,
      explicitOnlyFiles: evidence.pass ? [] : evidence.explicitFiles,
      impliedEvidence: evidence.implied,
      explicitEvidence: evidence.explicit,
    }

    if (evidence.pass) {
      passed++
    } else {
      failed++
    }
  }

  const missingSkills = Object.entries(skills)
    .filter(([, value]) => !value.pass)
    .map(([name]) => name)
    .sort()

  const missingDefaultSkills = [...missingSkills]

  return {
    summary: {
      totalSkillsOnDisk: skillIds.length,
      totalSkills: defaultSkills.length,
      checkedTier: "default",
      passed,
      failed,
      untiered: untieredSkills.length,
      nonDefaultSkills: nonDefaultSkillsByTier,
      testFilesScanned: testFiles.length,
      generatedAt: new Date().toISOString(),
    },
    untieredSkills,
    defaultSkills,
    missingDefaultSkills,
    missingSkills,
    skills,
    governance: {
      tierEvidencePath,
      duplicateTierAssignments: tierEvidence.duplicateAssignments,
    },
  }
}

function printHumanReport(report) {
  const { summary, missingDefaultSkills, untieredSkills } = report
  console.log("=== Skill Coverage (Implied) ===")
  console.log(`Checked tier: ${summary.checkedTier}`)
  console.log(`Default skills: ${summary.passed}/${summary.totalSkills} covered`)
  console.log(`Missing default coverage: ${summary.failed}`)
  console.log(`Untiered on-disk skills: ${summary.untiered}`)
  console.log(`Test files scanned: ${summary.testFilesScanned}`)
  console.log(
    `Non-default on-disk skills (manual/dormant/candidate-prune): ` +
    `${summary.nonDefaultSkills.manual}/${summary.nonDefaultSkills.dormant}/${summary.nonDefaultSkills["candidate-prune"]}`
  )

  if (untieredSkills.length > 0) {
    console.log("\nUntiered on-disk skills (hard failure):")
    for (const skill of untieredSkills) {
      console.log(`  - ${skill}`)
    }
  }

  if (missingDefaultSkills.length > 0) {
    console.log("\nMissing implied coverage for default skills:")
    for (const skill of missingDefaultSkills) {
      console.log(`  - ${skill}`)
    }
  } else {
    console.log("\nAll default-tier skills have implied coverage evidence.")
  }
}

function writeReport(reportPath, report) {
  const dir = path.dirname(reportPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
}

function main() {
  const options = parseArgs()
  const report = analyzeCoverage(options)

  if (options.reportPath) {
    writeReport(options.reportPath, report)
    console.log(`Coverage report written: ${options.reportPath}`)
  }

  if (options.jsonOutput) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printHumanReport(report)
  }

  if (options.strict && report.summary.failed > 0) {
    process.exit(1)
  }
  if (options.strict && report.summary.untiered > 0) {
    process.exit(1)
  }
  process.exit(0)
}

const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(__filename) ||
  path.resolve(process.argv[1]) === path.resolve(__filename.replace(/\.mjs$/, ""))
)

if (isMain) {
  main()
}

export {
  parseArgs,
  loadRegistry,
  loadTierEvidence,
  listTestFiles,
  collectEvidenceForSkill,
  analyzeCoverage,
}
