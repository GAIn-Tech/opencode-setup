#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, "..")
const SUPERPOWERS_DIR = path.join(ROOT, "opencode-config", "skills", "superpowers")

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
  const dirs = fs.readdirSync(SUPERPOWERS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())
  let updated = 0

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

  console.log(`\nNormalized ${updated} superpowers skills.`)
}

run()
