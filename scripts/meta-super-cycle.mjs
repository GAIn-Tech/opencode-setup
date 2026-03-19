#!/usr/bin/env bun

/**
 * meta-super-cycle.mjs
 *
 * Lazy, idempotent meta-audit coordinator for Prompt 1-6 in
 * .sisyphus/notepads/skill-playbook-2026-03-19.md.
 *
 * Behavior:
 * - Reads last-run timestamps from notepad audit outputs.
 * - Decides which audits are due by staleness threshold.
 * - Prints ready-to-run manual prompt text for due audits.
 * - Auto-applies low-risk fixes only with --apply.
 * - Queues high-risk changes for human review.
 * - Appends run report to .sisyphus/notepads/meta-super-log-YYYY-MM-DD.md.
 */

import { readFile, writeFile, access, rename } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, "..")

const PATHS = {
  playbook: path.join(ROOT, ".sisyphus", "notepads", "skill-playbook-2026-03-19.md"),
  notepads: path.join(ROOT, ".sisyphus", "notepads"),
  registry: path.join(ROOT, "opencode-config", "skills", "registry.json"),
  tiers: path.join(ROOT, "opencode-config", "tool-tiers.json"),
  preloadState: path.join(ROOT, ".opencode", "preload-state.json"),
}

const DAY_MS = 24 * 60 * 60 * 1000

const AUDITS = [
  {
    id: "health",
    promptNumber: 1,
    title: "Full Stack Health Audit",
    outputPrefix: "health-audit",
    thresholdDays: 1,
  },
  {
    id: "skill-coverage",
    promptNumber: 2,
    title: "Skill System Coverage Audit",
    outputPrefix: "skill-gaps",
    thresholdDays: 7,
  },
  {
    id: "context-budget",
    promptNumber: 3,
    title: "Context Budget Deep Dive",
    outputPrefix: "context-report",
    thresholdDays: 3,
  },
  {
    id: "rl-tier",
    promptNumber: 4,
    title: "Model Tier RL Audit",
    outputPrefix: "tier-audit",
    thresholdDays: 30,
  },
  {
    id: "observability",
    promptNumber: 5,
    title: "Context Observability Report",
    outputPrefix: "observability-report",
    thresholdDays: 7,
  },
  {
    id: "registry-maintenance",
    promptNumber: 6,
    title: "Registry Bridge Maintenance Pass",
    outputPrefix: "registry-maintenance",
    thresholdDays: 7,
  },
]

function parseArgs(argv) {
  const flags = new Set(argv.slice(2))
  const help = flags.has("--help") || flags.has("-h")
  const apply = flags.has("--apply")
  return { help, apply }
}

function printHelp() {
  console.log("meta-super-cycle.mjs")
  console.log("Usage: bun run scripts/meta-super-cycle.mjs [--apply] [--help]")
  console.log("")
  console.log("Coordinates lazy execution of 6 recurring audit prompts.")
  console.log("Default mode is dry-run (no registry/tool-tier mutations).")
  console.log("")
  console.log("Flags:")
  console.log("  --apply   Apply low-risk fixes to local config files")
  console.log("  --help    Show help")
  console.log("")
  console.log("Low-risk auto-fixes:")
  console.log("  - Remove phantom tier_2 skill hints")
  console.log("  - Add missing registry triggers")
  console.log("  - Sync RL override state (safe merges and stale refs cleanup)")
  console.log("")
  console.log("High-risk changes are never auto-applied; they are queued for review.")
}

function formatDate(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function parseIsoDate(day) {
  const date = new Date(`${day}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function ageInDays(lastRun, now) {
  if (!lastRun) return Number.POSITIVE_INFINITY
  return Math.floor((now.getTime() - lastRun.getTime()) / DAY_MS)
}

function uniq(list) {
  return [...new Set(list)]
}

async function atomicWrite(filePath, content, encoding = "utf8") {
  const tmpPath = `${filePath}.tmp.${Date.now()}`
  try {
    await writeFile(tmpPath, content, encoding)
    await rename(tmpPath, filePath)
  } catch (error) {
    try {
      await Bun.$`rm -f ${tmpPath}`.catch(() => {})
    } catch {}
    throw error
  }
}

function normalizeTriggerText(text) {
  return text.toLowerCase().trim().replace(/\s+/g, " ")
}

function createDefaultTriggers(skillName) {
  const spaced = skillName.replace(/[-_]+/g, " ").trim()
  return uniq([
    `use ${skillName}`,
    `${skillName} skill`,
    spaced,
  ]).map(normalizeTriggerText)
}

function parseHintTriggers(hint) {
  if (!hint || typeof hint !== "string") return []
  return uniq(
    hint
      .split(",")
      .map((entry) => normalizeTriggerText(entry))
      .filter(Boolean)
      .slice(0, 8)
  )
}

function stableString(value) {
  return JSON.stringify(value ?? null)
}

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function extractPrompts(playbookText) {
  const prompts = new Map()
  const rx = /## PROMPT\s+(\d+):\s+([^\n]+)[\s\S]*?\*\*What to say to the agent:\*\*[\s\S]*?```([\s\S]*?)```/g

  for (const match of playbookText.matchAll(rx)) {
    const number = Number(match[1])
    const title = match[2].trim()
    const promptText = match[3].trim()
    prompts.set(number, { number, title, promptText })
  }

  return prompts
}

async function detectLastRun(outputPrefix, notepadsDir) {
  const glob = new Bun.Glob(`${outputPrefix}-*.md`)
  let latest = null

  for await (const relPath of glob.scan({ cwd: notepadsDir, absolute: false })) {
    const fileName = path.basename(relPath)
    const match = fileName.match(new RegExp(`^${outputPrefix}-(\\d{4}-\\d{2}-\\d{2})\\.md$`))
    if (!match) continue

    const date = parseIsoDate(match[1])
    if (!date) continue

    if (!latest || date.getTime() > latest.date.getTime()) {
      latest = { fileName, date }
    }
  }

  return latest
}

function normalizeStateOverrides(raw) {
  const result = { promotions: {}, demotions: {} }
  if (!raw || typeof raw !== "object") return result

  if (raw.promotions || raw.demotions) {
    result.promotions = raw.promotions && typeof raw.promotions === "object" ? raw.promotions : {}
    result.demotions = raw.demotions && typeof raw.demotions === "object" ? raw.demotions : {}
    return result
  }

  for (const [skill, meta] of Object.entries(raw)) {
    if (!meta || typeof meta !== "object") continue

    if (meta.tier === 1 || (meta.promotedAt && !meta.demotedAt)) {
      result.promotions[skill] = {
        taskTypes: Array.isArray(meta.taskTypes) ? meta.taskTypes : [],
        promotedAt: meta.promotedAt ?? null,
        reason: typeof meta.reason === "string" ? meta.reason : "manual",
      }
      continue
    }

    if (meta.tier === 2 || meta.demotedAt) {
      result.demotions[skill] = {
        demotedAt: meta.demotedAt ?? null,
        reason: typeof meta.reason === "string" ? meta.reason : "manual",
      }
    }
  }

  return result
}

function planLowRiskFixes(registry, tiers, preloadStateRaw) {
  const lowRisk = []
  const highRisk = []

  const skills = registry?.skills && typeof registry.skills === "object" ? registry.skills : {}
  const skillSet = new Set(Object.keys(skills))

  const tier2Skills = tiers?.tier_2?.skills && typeof tiers.tier_2.skills === "object"
    ? tiers.tier_2.skills
    : {}

  const phantomTier2 = Object.keys(tier2Skills).filter((name) => !skillSet.has(name))
  for (const skill of phantomTier2) {
    lowRisk.push({
      type: "remove-phantom-tier2",
      target: skill,
      message: `Remove phantom tier_2 entry '${skill}'`,
      apply: () => {
        delete tier2Skills[skill]
      },
    })
  }

  for (const [skill, data] of Object.entries(skills)) {
    const triggers = Array.isArray(data?.triggers) ? data.triggers.filter(Boolean) : []
    if (triggers.length > 0) continue

    const hint = tier2Skills[skill]?.trigger_hint
    const generated = uniq([...parseHintTriggers(hint), ...createDefaultTriggers(skill)])

    lowRisk.push({
      type: "add-missing-triggers",
      target: skill,
      message: `Add ${generated.length} generated trigger(s) to '${skill}'`,
      apply: () => {
        data.triggers = generated
      },
    })
  }

  const rl = tiers.rl_overrides && typeof tiers.rl_overrides === "object" ? tiers.rl_overrides : {}
  const promotions = rl.promotions && typeof rl.promotions === "object" ? rl.promotions : {}
  const demotions = rl.demotions && typeof rl.demotions === "object" ? rl.demotions : {}

  for (const skill of Object.keys(promotions)) {
    if (!skillSet.has(skill)) {
      lowRisk.push({
        type: "rl-remove-missing-promotion",
        target: skill,
        message: `Remove RL promotion for missing skill '${skill}'`,
        apply: () => {
          delete promotions[skill]
        },
      })
    }
  }

  for (const skill of Object.keys(demotions)) {
    if (!skillSet.has(skill)) {
      lowRisk.push({
        type: "rl-remove-missing-demotion",
        target: skill,
        message: `Remove RL demotion for missing skill '${skill}'`,
        apply: () => {
          delete demotions[skill]
        },
      })
    }
  }

  const stateOverrides = normalizeStateOverrides(preloadStateRaw?.tierOverrides ?? preloadStateRaw?.overrides ?? preloadStateRaw)

  for (const [skill, payload] of Object.entries(stateOverrides.promotions)) {
    if (!skillSet.has(skill)) continue

    if (!(skill in promotions)) {
      lowRisk.push({
        type: "rl-sync-add-promotion",
        target: skill,
        message: `Sync RL promotion '${skill}' from preload state`,
        apply: () => {
          promotions[skill] = payload
        },
      })
      continue
    }

    if (stableString(promotions[skill]) !== stableString(payload)) {
      highRisk.push(`RL promotion conflict for '${skill}' (preload-state vs tool-tiers)`) 
    }
  }

  for (const [skill, payload] of Object.entries(stateOverrides.demotions)) {
    if (!skillSet.has(skill)) continue

    if (!(skill in demotions)) {
      lowRisk.push({
        type: "rl-sync-add-demotion",
        target: skill,
        message: `Sync RL demotion '${skill}' from preload state`,
        apply: () => {
          demotions[skill] = payload
        },
      })
      continue
    }

    if (stableString(demotions[skill]) !== stableString(payload)) {
      highRisk.push(`RL demotion conflict for '${skill}' (preload-state vs tool-tiers)`) 
    }
  }

  for (const skill of Object.keys(promotions)) {
    if (skill in demotions) {
      highRisk.push(`Skill '${skill}' appears in both rl_overrides.promotions and rl_overrides.demotions`) 
    }
  }

  return { lowRisk, highRisk }
}

function renderDueAuditPrompt(audit, promptText, todayStamp) {
  const outputPath = `.sisyphus/notepads/${audit.outputPrefix}-${todayStamp}.md`
  return [
    `- Audit: ${audit.title}`,
    `  Prompt #${audit.promptNumber}`,
    `  Output path: ${outputPath}`,
    "  Prompt:",
    "```",
    promptText,
    "```",
  ].join("\n")
}

async function appendLog(logPath, body, todayStamp) {
  const header = `# Meta Super Log (${todayStamp})\n\n`
  const hasFile = await exists(logPath)

  if (!hasFile) {
    await atomicWrite(logPath, header + body, "utf8")
    return
  }

  await writeFile(logPath, `\n${body}`, { encoding: "utf8", flag: "a" })
}

function buildLogEntry({
  nowIso,
  mode,
  dueAudits,
  allAuditStatus,
  lowRiskPlanned,
  lowRiskApplied,
  highRisk,
}) {
  const lines = []
  lines.push(`## Run ${nowIso}`)
  lines.push("")
  lines.push(`- Mode: ${mode}`)
  lines.push(`- Due audits: ${dueAudits.length}`)
  lines.push(`- Low-risk fixes planned: ${lowRiskPlanned.length}`)
  lines.push(`- Low-risk fixes applied: ${lowRiskApplied.length}`)
  lines.push(`- High-risk review items: ${highRisk.length}`)
  lines.push("")
  lines.push("### Audit Staleness")
  for (const item of allAuditStatus) {
    const last = item.lastRun ? formatDate(item.lastRun) : "never"
    const age = Number.isFinite(item.ageDays) ? `${item.ageDays}d` : "never"
    lines.push(`- ${item.title}: last=${last}, age=${age}, threshold=${item.thresholdDays}d, due=${item.due ? "yes" : "no"}`)
  }

  lines.push("")
  lines.push("### Low-Risk Fixes")
  if (lowRiskPlanned.length === 0) {
    lines.push("- none")
  } else {
    for (const item of lowRiskPlanned) {
      const status = lowRiskApplied.includes(item.message) ? "applied" : "queued"
      lines.push(`- ${status}: ${item.message}`)
    }
  }

  lines.push("")
  lines.push("### High-Risk Queue")
  if (highRisk.length === 0) {
    lines.push("- none")
  } else {
    for (const item of highRisk) lines.push(`- ${item}`)
  }

  lines.push("")
  return lines.join("\n")
}

async function safeReadFile(filePath, description) {
  try {
    return await readFile(filePath, "utf8")
  } catch (error) {
    console.warn(`Warning: Could not read ${description} (${filePath}): ${error.message}`)
    return null
  }
}

async function safeParseJSON(content, fileName) {
  if (!content) return null
  try {
    return JSON.parse(content)
  } catch (error) {
    console.warn(`Warning: Could not parse ${fileName}: ${error.message}`)
    return null
  }
}

async function main() {
  const { help, apply } = parseArgs(process.argv)
  if (help) {
    printHelp()
    return
  }

  const now = new Date()
  const todayStamp = formatDate(now)
  const nowIso = now.toISOString()

  // Read files with cascade failure protection - each file is independent
  const playbookRaw = await safeReadFile(PATHS.playbook, "playbook")
  const registryRaw = await safeReadFile(PATHS.registry, "registry")
  const tiersRaw = await safeReadFile(PATHS.tiers, "tool-tiers")

  // Critical dependency check - need at least registry and tiers to function
  if (!registryRaw || !tiersRaw) {
    console.error("Error: Cannot proceed without registry and tool-tiers files")
    process.exit(1)
  }

  const prompts = playbookRaw ? extractPrompts(playbookRaw) : new Map()
  const registry = await safeParseJSON(registryRaw, "registry.json")
  const tiers = await safeParseJSON(tiersRaw, "tool-tiers.json")

  if (!registry || !tiers) {
    console.error("Error: Failed to parse required JSON files")
    process.exit(1)
  }

  let preloadState = null
  if (await exists(PATHS.preloadState)) {
    try {
      preloadState = JSON.parse(await readFile(PATHS.preloadState, "utf8"))
    } catch {
      console.warn("Warning: Could not parse preload-state.json, skipping RL sync")
      preloadState = null
    }
  }

  const allAuditStatus = []
  for (const audit of AUDITS) {
    const last = await detectLastRun(audit.outputPrefix, PATHS.notepads)
    const lastRun = last?.date ?? null
    const ageDays = ageInDays(lastRun, now)
    const due = !Number.isFinite(ageDays) || ageDays >= audit.thresholdDays

    allAuditStatus.push({
      ...audit,
      lastRun,
      ageDays,
      due,
      lastFile: last?.fileName ?? null,
    })
  }

  const dueAudits = allAuditStatus.filter((audit) => audit.due)

  const { lowRisk, highRisk } = planLowRiskFixes(registry, tiers, preloadState)
  const lowRiskApplied = []

  if (apply) {
    for (const fix of lowRisk) {
      fix.apply()
      lowRiskApplied.push(fix.message)
    }

    if (lowRiskApplied.length > 0) {
      if (tiers.rl_overrides && typeof tiers.rl_overrides === "object") {
        tiers.rl_overrides.last_updated = nowIso
      }

      await Promise.all([
        atomicWrite(PATHS.registry, `${JSON.stringify(registry, null, 2)}\n`, "utf8"),
        atomicWrite(PATHS.tiers, `${JSON.stringify(tiers, null, 2)}\n`, "utf8"),
      ])
    }
  }

  console.log("Meta Super Cycle")
  console.log("================")
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`)
  console.log("")

  console.log("Audit status:")
  for (const audit of allAuditStatus) {
    const last = audit.lastRun ? formatDate(audit.lastRun) : "never"
    const age = Number.isFinite(audit.ageDays) ? `${audit.ageDays}d` : "never"
    console.log(`- ${audit.title}: last=${last}, age=${age}, threshold=${audit.thresholdDays}d, due=${audit.due ? "yes" : "no"}`)
  }

  console.log("")
  if (dueAudits.length === 0) {
    console.log("No audits are due today.")
  } else {
    console.log(`Audits due now: ${dueAudits.length}`)
    for (const audit of dueAudits) {
      const prompt = prompts.get(audit.promptNumber)?.promptText ?? "<prompt missing in playbook>"
      console.log("")
      console.log(renderDueAuditPrompt(audit, prompt, todayStamp))
    }
  }

  console.log("")
  console.log(`Low-risk fixes (${apply ? "applied" : "planned"}): ${lowRisk.length}`)
  if (lowRisk.length === 0) {
    console.log("- none")
  } else {
    for (const fix of lowRisk) {
      const tag = apply ? "applied" : "would-apply"
      console.log(`- ${tag}: ${fix.message}`)
    }
  }

  console.log("")
  console.log(`High-risk review queue: ${highRisk.length}`)
  if (highRisk.length === 0) {
    console.log("- none")
  } else {
    for (const issue of highRisk) console.log(`- ${issue}`)
  }

  const logPath = path.join(PATHS.notepads, `meta-super-log-${todayStamp}.md`)
  const logBody = buildLogEntry({
    nowIso,
    mode: apply ? "APPLY" : "DRY-RUN",
    dueAudits,
    allAuditStatus,
    lowRiskPlanned: lowRisk,
    lowRiskApplied,
    highRisk,
  })
  await appendLog(logPath, `${logBody}\n`, todayStamp)

  console.log("")
  console.log(`Log updated: ${path.relative(ROOT, logPath)}`)
}

main().catch((error) => {
  console.error("meta-super-cycle failed")
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
})
