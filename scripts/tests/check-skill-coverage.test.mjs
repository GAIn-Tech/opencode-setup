import { describe, test, expect } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import path from "node:path"
import os from "node:os"

import {
  analyzeCoverage,
  collectEvidenceForSkill,
} from "../check-skill-coverage.mjs"

function makeTempRoot() {
  return mkdtempSync(path.join(os.tmpdir(), "skill-coverage-test-"))
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

describe("check-skill-coverage", () => {
  test("marks skill pass when implied routing assertion exists", () => {
    const files = [
      {
        filePath: "scripts/tests/routing.test.js",
        content: "expect(result.topSkill).toBe('alpha-skill') expectedTopSkill: 'alpha-skill'",
      },
    ]

    const result = collectEvidenceForSkill(
      "alpha-skill",
      { triggers: ["complex routing"] },
      files
    )

    expect(result.pass).toBe(true)
    expect(result.impliedFiles).toContain("scripts/tests/routing.test.js")
  })

  test("does not pass on explicit-only load_skills evidence", () => {
    const files = [
      {
        filePath: "scripts/tests/explicit.test.js",
        content: "task({ load_skills: ['beta-skill'] })",
      },
    ]

    const result = collectEvidenceForSkill(
      "beta-skill",
      { triggers: ["nothing"] },
      files
    )

    expect(result.pass).toBe(false)
    expect(result.impliedFiles).toEqual([])
    expect(result.explicitFiles).toContain("scripts/tests/explicit.test.js")
  })

  test("uses routing-context trigger matching as implied evidence", () => {
    const files = [
      {
        filePath: "scripts/tests/implied-by-trigger.test.js",
        content: "skill-profile-loader recommendprofiles with orchestration and trigger phrase useful trigger",
      },
    ]

    const result = collectEvidenceForSkill(
      "gamma-skill",
      { triggers: ["useful trigger"] },
      files
    )

    expect(result.pass).toBe(true)
    expect(result.impliedFiles).toContain("scripts/tests/implied-by-trigger.test.js")
  })

  test("analyzeCoverage reports missing skills deterministically", () => {
    const tempRoot = makeTempRoot()
    try {
      const scriptsTestsDir = path.join(tempRoot, "scripts/tests")
      const registryPath = path.join(tempRoot, "opencode-config/skills/registry.json")
      const registryDir = path.dirname(registryPath)
      const tierEvidencePath = path.join(
        tempRoot,
        ".sisyphus/evidence/skill-classification-recommendations.json"
      )
      const tierEvidenceDir = path.dirname(tierEvidencePath)
      const coveredSkillDir = path.join(registryDir, "skill-covered")
      const missingSkillDir = path.join(registryDir, "skill-missing")

      mkdirSync(scriptsTestsDir, { recursive: true })
      mkdirSync(registryDir, { recursive: true })
      mkdirSync(tierEvidenceDir, { recursive: true })
      mkdirSync(coveredSkillDir, { recursive: true })
      mkdirSync(missingSkillDir, { recursive: true })

      writeFileSync(path.join(coveredSkillDir, "SKILL.md"), "# covered\n", "utf8")
      writeFileSync(path.join(missingSkillDir, "SKILL.md"), "# missing\n", "utf8")

      writeJson(registryPath, {
        skills: {
          "skill-covered": {
            triggers: ["covered trigger"],
          },
          "skill-missing": {
            triggers: ["missing trigger"],
          },
        },
      })

      writeFileSync(
        path.join(scriptsTestsDir, "coverage.test.js"),
        "expect(result.topSkill).toBe('skill-covered')",
        "utf8"
      )

      writeJson(tierEvidencePath, {
        tierRecommendations: {
          default: ["skill-covered", "skill-missing"],
          manual: [],
          dormant: [],
          "candidate-prune": [],
        },
      })

      const report = analyzeCoverage({
        rootDir: tempRoot,
        registryPath,
        skillsDir: registryDir,
        tierEvidencePath,
      })

      expect(report.summary.totalSkillsOnDisk).toBe(2)
      expect(report.summary.totalSkills).toBe(2)
      expect(report.summary.passed).toBe(1)
      expect(report.summary.failed).toBe(1)
      expect(report.summary.untiered).toBe(0)
      expect(report.missingSkills).toEqual(["skill-missing"])
      expect(report.missingDefaultSkills).toEqual(["skill-missing"])
      expect(report.skills["skill-covered"].pass).toBe(true)
      expect(report.skills["skill-missing"].pass).toBe(false)
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  test("analyzeCoverage reports untiered skills", () => {
    const tempRoot = makeTempRoot()
    try {
      const registryPath = path.join(tempRoot, "opencode-config/skills/registry.json")
      const registryDir = path.dirname(registryPath)
      const tierEvidencePath = path.join(
        tempRoot,
        ".sisyphus/evidence/skill-classification-recommendations.json"
      )
      const tierEvidenceDir = path.dirname(tierEvidencePath)
      const skillDir = path.join(registryDir, "untiered-skill")

      mkdirSync(registryDir, { recursive: true })
      mkdirSync(tierEvidenceDir, { recursive: true })
      mkdirSync(skillDir, { recursive: true })

      writeFileSync(path.join(skillDir, "SKILL.md"), "# untiered\n", "utf8")

      writeJson(registryPath, {
        skills: {
          "untiered-skill": {
            triggers: ["untiered trigger"],
          },
        },
      })

      writeJson(tierEvidencePath, {
        tierRecommendations: {
          default: [],
          manual: [],
          dormant: [],
          "candidate-prune": [],
        },
      })

      const report = analyzeCoverage({
        rootDir: tempRoot,
        registryPath,
        skillsDir: registryDir,
        tierEvidencePath,
      })

      expect(report.summary.untiered).toBe(1)
      expect(report.untieredSkills).toEqual(["untiered-skill"])
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
