---
# REQUIRED FIELDS
name: context7
description: >
  Fetch up-to-date library documentation and code examples from Context7.
  Use when you need accurate API references, framework docs, or library usage
  examples instead of relying on potentially stale training data.

# OPTIONAL METADATA
version: 1.0.0
category: research
tags: [documentation, libraries, api-reference, frameworks, context7]

# COMPOSITION METADATA
dependencies: []
synergies: ["research-builder", "writing-plans", "test-driven-development"]
conflicts: []
outputs:
  - type: artifact
    name: library-documentation
    location: runtime
inputs:
  - type: user-input
    name: library-name
    required: true
  - type: user-input
    name: query-topic
    required: true
---

# Context7

## Overview

Context7 is a remote MCP that provides accurate, up-to-date documentation and code
examples for thousands of libraries and frameworks. Use it whenever you need correct
API signatures, configuration options, or usage patterns — especially for libraries
that have released new versions since the model's training cutoff.

## When to Use

Use this skill when:
- Implementing or debugging code using a third-party library or framework
- Unsure about the correct API signature, parameters, or configuration options
- Working with a library that may have changed since the model's training data
- Need real code examples for a specific use case (not just general advice)
- Researching whether a feature exists in a library before implementing it yourself
- Writing tests that depend on correct library behavior

Do NOT use this skill for:
- General programming concepts (use training knowledge)
- Internal/proprietary library code (Context7 only covers public libraries)
- When you already have accurate documentation in the current context
- Simple questions about well-established, stable APIs unlikely to have changed

## Inputs Required

- **Library Name**: Name of the package/library (e.g., `"react"`, `"express"`, `"bun"`)
- **Query Topic**: Specific thing to look up (e.g., `"useEffect cleanup"`, `"middleware configuration"`)
- **Version** (optional): If a specific version is needed (e.g., `"v18"`)

## Workflow

### Phase 1: Resolve Library ID

1. Run CLI command via bash or use the wrapper script:
   ```bash
   bun scripts/context7-resolve-library-id.js "react" "useEffect hook cleanup function"
   ```
   OR directly:
   ```bash
   ctx7 library "react" "useEffect hook cleanup function" --json
   ```
2. Parse JSON output and pick the best match based on:
   - Name similarity (exact match preferred)
   - Source reputation (`High` > `Medium` > `Low`)
   - Benchmark score (higher = better documentation coverage)
   - Code snippet count (more = richer examples)
3. Note the `libraryId` (format: `/org/project` or `/org/project/version`)

### Phase 2: Query Documentation

1. Run CLI command via bash or use the wrapper script:
   ```bash
   bun scripts/context7-query-docs.js "/facebook/react" "useEffect cleanup function with event listeners"
   ```
   OR directly:
   ```bash
   ctx7 query "/facebook/react" "useEffect cleanup function with event listeners" --json
   ```
2. Parse JSON output containing documentation and code examples
3. Apply to the current implementation task

### Phase 3: Version-Specific Lookup (if needed)

1. If a specific version is required, use versioned ID format: `/org/project/version`
   - Example: `/vercel/next.js/v14.3.0-canary.87`
2. Check `versions` field in the resolve response for available version IDs

## Must Do

- ALWAYS resolve library ID first — never hardcode a library ID without resolving
- Use the `query` parameter in resolve to get relevance-ranked results
- Pick libraries with `High` or `Medium` source reputation when available
- Prefer results with higher benchmark scores and more code snippets
- Do NOT call `resolve-library-id` more than 3 times per question (CLI limit)
- Do NOT call `query-docs` more than 3 times per question (CLI limit)
- Use CLI wrapper scripts (`context7-resolve-library-id.js`, `context7-query-docs.js`) for better error handling

## Must Not Do

- Don't guess or invent library IDs — always resolve first
- Don't use Context7 for internal, private, or undocumented libraries
- Don't call the CLI tools more than 3 times each per task (use best result available)
- Don't ignore the source reputation field — low-reputation results may be inaccurate
- Don't assume MCP server is running — use CLI fallback if MCP unavailable

## Handoff Protocol

### Receives From
- Main agent: Library name + specific question or implementation task
- `research-builder`: Library research request as part of spec-first workflow
- `writing-plans`: Library capability check during planning phase

### Hands Off To
- Main agent: Accurate documentation and code examples for implementation
- `test-driven-development`: Correct API signatures for writing accurate tests

## Output Contract

1. **Library Documentation**: Accurate, up-to-date API reference for the queried topic
2. **Code Examples**: Real-world usage patterns from the library's documentation
3. **Version Info**: Which version the documentation applies to

## Quick Start

```
1. bun scripts/context7-resolve-library-id.js "bun" "file I/O"
   # OR ctx7 library "bun" "file I/O" --json
2. Pick best match from results      → note the libraryId
3. bun scripts/context7-query-docs.js "/oven-sh/bun" "file I/O read write"
   # OR ctx7 query "/oven-sh/bun" "file I/O read write" --json
4. Apply returned docs to your code
```

**CLI Wrapper Advantages:**
- Auditable command execution (bash history)
- No MCP server startup failures
- Consistent output format
- Better error handling
- Works across all environments

## Common Library IDs (Resolved Examples)

| Library | Typical libraryId |
|---------|-------------------|
| React | `/facebook/react` |
| Next.js | `/vercel/next.js` |
| Bun | `/oven-sh/bun` |
| Express | `/expressjs/express` |
| Supabase | `/supabase/supabase` |
| Tailwind CSS | `/tailwindlabs/tailwindcss` |

Note: Always resolve — IDs can change with new versions. These are illustrative only.
