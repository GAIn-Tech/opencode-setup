import { describe, test, expect } from "bun:test"
import path from "node:path"

import { analyzeCoverage } from "../check-skill-coverage.mjs"

const ROOT = path.join(import.meta.dir, "..", "..")

describe("default-core implied skill coverage matrix", () => {
  test("default-tier skills have implied dynamic selection evidence", () => {
    const report = analyzeCoverage({ rootDir: ROOT })

    expect(report.summary.checkedTier).toBe("default")
    expect(report.summary.failed).toBe(0)
    expect(report.missingDefaultSkills).toEqual([])
    expect(report.summary.totalSkills).toBeGreaterThanOrEqual(8)
    expect(report.summary.totalSkillsOnDisk).toBeGreaterThan(report.summary.totalSkills)
  })

  test("all on-disk skills are explicitly tiered", () => {
    const report = analyzeCoverage({ rootDir: ROOT })

    expect(report.untieredSkills).toEqual([])
    expect(report.summary.untiered).toBe(0)
  })
})
