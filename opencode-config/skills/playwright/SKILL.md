---
# REQUIRED FIELDS
name: playwright
description: >
  Direct browser automation through the Playwright MCP. Use when you want an explicit,
  first-class MCP path for navigation, clicking, filling forms, screenshots, and UI verification.

# OPTIONAL METADATA
version: 1.0.0
category: browser
tags: [browser, playwright, automation, screenshots, ui-testing]

# COMPOSITION METADATA
dependencies: []
synergies: ["frontend-ui-ux", "verification-before-completion"]
conflicts: ["agent-browser"]
outputs:
  - type: artifact
    name: browser-evidence
    location: runtime
inputs:
  - type: user-input
    name: browser-task
    required: true
---

# Playwright

## Overview

Playwright is the direct MCP path for browser automation in this repo. Use it when a task
 needs explicit browser control, screenshots, UI verification, navigation, or interaction with
 live pages. Prefer this over indirect browser aliases when there is no compelling reason not to.

## When to Use

Use this skill when:
- You need to open a page and interact with it directly
- You need screenshots or visual verification
- You need multi-step browser flows with real page state
- You want the browser task to map clearly to the Playwright MCP in telemetry and reporting

Do NOT use this skill for:
- Static page fetches that do not require a browser
- Pure codebase questions
- Browser tasks where `agent-browser` is explicitly required for CLI/ref-specific behavior

## Workflow

1. Launch the Playwright MCP path for the browser task
2. Navigate and interact with the page in the minimum number of steps needed
3. Capture screenshots or evidence when verification matters
4. Return the concrete browser result, not just a narration

## Must Do

- Prefer the direct Playwright MCP path for browser tasks
- Capture evidence for verification-heavy work
- Keep navigation and interaction scoped to the actual request

## Must Not Do

- Do NOT use browser automation for tasks solvable with static fetches
- Do NOT over-automate simple one-step checks
- Do NOT hide browser evidence when the task is about verification

## Quick Start

```
1. Open the target page with Playwright MCP
2. Interact with the page as needed
3. Capture screenshot or verification evidence
4. Return the result succinctly
```
