# Project-Specific Audit Template

**Created:** YYYY-MM-DD
**Purpose:** Project-specific audit prompts that complement the global skill playbook. Run this after initializing new project KB to capture project-specific state.

---

## Audit Prompts

### Project Health Audit

**What to say to the agent:**
"Audit this project for active reliability and correctness risks. Focus on current blockers, flaky paths, and recurring failure modes. Return prioritized findings with concrete remediation steps."
**Real work:** Project-specific issues identified and documented
**Skills fired:** code-doctor, incident-commander, sequentialthinking

---

### Project Structure Audit

**What to say to the agent:**
"Analyze this repository structure and identify architectural drift, ownership gaps, and module boundary violations. Recommend practical restructuring steps."
**Real work:** Project structure validated and documented
**Skills fired:** codebase-auditor, grep

---

### Project Learning Capture

**What to say to the agent:**
"Summarize key implementation learnings from recent work in this project and classify what should remain local versus what is safe to sync globally."
**Real work:** Project learnings captured for potential cross-project sync
**Skills fired:** sequentialthinking, codebase-auditor

---

## Usage

Run audits based on project staleness:
- New project: Run all three audits after first session
- Active project: Run health audit weekly
- Mature project: Run learning capture monthly

## Output Locations

All outputs go to .sisyphus/notepads/:
- project-health-audit-YYYY-MM-DD.md
- project-structure-audit-YYYY-MM-DD.md
- project-learning-capture-YYYY-MM-DD.md
