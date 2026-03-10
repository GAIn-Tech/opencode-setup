---
# REQUIRED FIELDS
name: grep
description: >
  External code search via grep-based MCP tools. Use when you need real examples from
  public repositories or targeted GitHub code pattern searches.

# OPTIONAL METADATA
version: 1.0.0
category: research
tags: [code-search, github, examples, patterns, repositories]

# COMPOSITION METADATA
dependencies: []
synergies: ["context7", "research-builder", "writing-plans"]
conflicts: []
outputs:
  - type: artifact
    name: external-code-examples
    location: runtime
inputs:
  - type: user-input
    name: code-pattern
    required: true
---

# Grep

## Overview

Grep MCP tools search public code for real implementation patterns. Use them when you
 need concrete examples from GitHub repositories rather than API documentation alone.

## When to Use

Use this skill when:
- You need real-world code examples for a library or integration pattern
- You want to compare how different repos implement the same feature
- The question is about code shape or usage patterns, not generic prose

Do NOT use this skill for:
- Searching the current repo (use local `grep`/`ast_grep_search` instead)
- General web research without a code-search need
- Library API reference when Context7 already answers it directly

## Workflow

1. Use `grep_grep_query` for straightforward GitHub code search by query/language/repo/path
2. Use `grep_app_searchGitHub` when you need richer pattern filtering or regex-oriented example hunting
3. Pull only enough examples to answer the implementation question

## Must Do

- Search for actual code patterns, not vague keywords
- Filter by language or repo when the search space is broad
- Prefer a small set of high-signal examples over many noisy hits

## Must Not Do

- Do NOT use external grep for current-repo code search
- Do NOT treat example code as authoritative API docs when Context7 is available
- Do NOT dump large unrelated snippets into the conversation

## Quick Start

```
1. grep_grep_query { query: "useState(", language: "TypeScript" }
2. grep_app_searchGitHub { query: "getServerSession", language: ["TypeScript"], repo: "vercel/" }
```
