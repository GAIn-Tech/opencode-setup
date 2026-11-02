#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseFrontmatter } from "./lib/yaml-frontmatter-parser.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, "..")
const SKILLS_DIR = path.join(ROOT, "opencode-config", "skills")
const SUPERPOWERS_DIR = path.join(SKILLS_DIR, "superpowers")

const REQUIRED_FRONTMATTER_LINES = [
  'version: "1.0.0"',
  'category: "workflow"',
  'tags: ["superpowers", "workflow"]',
  'dependencies: []',
  'synergies: []',
  'conflicts: []',
  'outputs: ["execution guidance"]',
  'inputs: ["task context"]',
]

const REQUIRED_SECTIONS = [
  {
    heading: "## Overview",
    body: "Summarize what this skill does, when it is useful, and what outcome it should produce.",
  },
  {
    heading: "## When to Use",
    body: "Use this skill when its description matches the task domain and it provides a safer or more structured workflow than ad-hoc execution.",
  },
  {
    heading: "## Inputs Required",
    body: "- Task objective\n- Relevant files or modules\n- Constraints and success criteria",
  },
  {
    heading: "## Workflow",
    body: "Follow the workflow described in this skill's existing process/phases. Keep steps explicit and verification-first.",
  },
  {
    heading: "## Must Do",
    body: "- Follow the skill workflow in order\n- Validate outputs before handoff\n- Surface assumptions and risks",
  },
  {
    heading: "## Must Not Do",
    body: "- Skip verification gates\n- Make destructive changes without explicit requirements\n- Hide uncertainty",
  },
  {
    heading: "## Handoff Protocol",
    body: "**Receives From**: Orchestrator or upstream skill\n\n**Hands Off To**: Downstream execution/review skill with evidence and open risks",
  },
  {
    heading: "## Output Contract",
    body: "Return concise, structured output with: decisions made, evidence used, unresolved risks, and next step.",
  },
  {
    heading: "## Quick Start",
    body: "1. Confirm this skill is the right match\n2. Gather required inputs\n3. Execute workflow\n4. Verify and hand off",
  },
]

/**
 * Discover all skill directories (superpowers + top-level imported skills).
 * @param {string} baseDir - The skills directory root
 * @returns {{name: string, dir: string, isSuperpowers: boolean}[]}
 */
export function discoverSkillDirs(baseDir) {
  const results = []

  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith(".")) continue
    if (entry.name === "semantic-matching") continue // data dir, not a skill

    if (entry.name === "superpowers") {
      // Recurse into superpowers
      const spDir = path.join(baseDir, "superpowers")
      if (fs.existsSync(spDir)) {
        const spEntries = fs.readdirSync(spDir, { withFileTypes: true })
        for (const sp of spEntries) {
          if (!sp.isDirectory()) continue
          const skillMd = path.join(spDir, sp.name, "SKILL.md")
          if (fs.existsSync(skillMd)) {
            results.push({ name: sp.name, dir: path.join(spDir, sp.name), isSuperpowers: true })
          }
        }
      }
      continue
    }

    // Top-level skill directory (imported skills)
    const skillMd = path.join(baseDir, entry.name, "SKILL.md")
    if (fs.existsSync(skillMd)) {
      results.push({ name: entry.name, dir: path.join(baseDir, entry.name), isSuperpowers: false })
    }
  }

  return results
}

/**
 * Validate that a skill's frontmatter has required fields: name, description.
 * @param {string} skillName - Name of the skill
 * @param {object} frontmatter - Parsed frontmatter object
 * @returns {string[]} Array of error messages (empty = valid)
 */
export function validateFrontmatterFields(skillName, frontmatter) {
  const errors = []
  if (!frontmatter) {
    errors.push(`Skill '${skillName}': no frontmatter found`)
    return errors
  }
  if (!frontmatter.name) {
    errors.push(`Skill '${skillName}': missing required frontmatter field 'name'`)
  }
  if (!frontmatter.description) {
    errors.push(`Skill '${skillName}': missing required frontmatter field 'description'`)
  }
  return errors
}

function normalizeFrontmatter(text) {
  if (!text.startsWith("---\n")) {
    return text
  }

  const end = text.indexOf("\n---\n", 4)
  if (end === -1) {
    return text
  }

  const fmRaw = text.slice(4, end)
  const body = text.slice(end + 5)

  let fm = fmRaw
  for (const line of REQUIRED_FRONTMATTER_LINES) {
    const key = line.split(":")[0]
    const keyPattern = new RegExp(`^${key}:`, "m")
    if (!keyPattern.test(fm)) {
      fm += `\n${line}`
    }
  }

  return `---\n${fm}\n---\n${body}`
}

function ensureSections(text) {
  let out = text
  for (const section of REQUIRED_SECTIONS) {
    if (!out.includes(section.heading)) {
      out = `${out.trim()}\n\n${section.heading}\n\n${section.body}\n`
    }
  }
  return out
}

function run() {
  // Normalize superpowers skills (existing behavior)
  let updated = 0
  if (fs.existsSync(SUPERPOWERS_DIR)) {
    const dirs = fs.readdirSync(SUPERPOWERS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())

    for (const dir of dirs) {
      const filePath = path.join(SUPERPOWERS_DIR, dir.name, "SKILL.md")
      if (!fs.existsSync(filePath)) continue

      const original = fs.readFileSync(filePath, "utf8")
      const withFrontmatter = normalizeFrontmatter(original)
      const normalized = ensureSections(withFrontmatter)

      if (normalized !== original) {
        fs.writeFileSync(filePath, normalized, "utf8")
        updated += 1
        console.log(`updated: ${path.relative(ROOT, filePath)}`)
      }
    }
  }

  console.log(`\nNormalized ${updated} superpowers skills.`)

  // Validate all skills (superpowers + imported) have required frontmatter
  const allSkills = discoverSkillDirs(SKILLS_DIR)
  const validationErrors = []

  for (const skill of allSkills) {
    const content = fs.readFileSync(path.join(skill.dir, "SKILL.md"), "utf8")
    const fm = parseFrontmatter(content)
    const errors = validateFrontmatterFields(skill.name, fm)
    validationErrors.push(...errors)
  }

  if (validationErrors.length > 0) {
    console.log(`\nFrontmatter validation warnings: ${validationErrors.length}`)
    for (const err of validationErrors) {
      console.log(`  ⚠ ${err}`)
    }
  } else {
    console.log(`Frontmatter validation: ${allSkills.length} skills checked, all valid`)
  }
}

if (import.meta.main) {
  run()
}
