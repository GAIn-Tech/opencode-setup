---
# REQUIRED FIELDS
name: websearch
description: >
  Live web research via the websearch MCP. Use when you need current information,
  extracted page content, screenshots, transcripts, or structured web data.

# OPTIONAL METADATA
version: 1.0.0
category: research
tags: [web, search, current-events, scraping, screenshots, transcripts]

# COMPOSITION METADATA
dependencies: []
synergies: ["research-builder", "context7", "writing-plans"]
conflicts: []
outputs:
  - type: artifact
    name: web-research-results
    location: runtime
inputs:
  - type: user-input
    name: web-query
    required: true
---

# Websearch

## Overview

Websearch provides live internet search and page extraction when the answer depends on
 current web content rather than repo state or static documentation.

## When to Use

Use this skill when:
- You need current information from the web
- You need to extract content from live pages or search results
- A task requires screenshots, PDFs, structured scraping, or YouTube transcripts
- Context7 is not the right fit because the problem is broader than library docs

Do NOT use this skill for:
- Pure codebase questions
- Stable library API questions that Context7 handles better
- Simple known URLs that another targeted tool already covers better

## Workflow

1. Use `websearch_search` for lightweight search discovery
2. Use `websearch_search_and_crawl` when you need extracted content from top results
3. Use specialized tools like `websearch_capture_screenshot`, `websearch_extract_structured`, or `websearch_get_youtube_transcript` only when needed

## Must Do

- Start with the narrowest websearch tool that fits the question
- Prefer search + extract only when actual page content is needed
- Capture source URLs when summarizing results

## Must Not Do

- Do NOT use websearch for internal repo exploration
- Do NOT replace Context7 for up-to-date library API lookup
- Do NOT scrape more page detail than the task requires

## Quick Start

```
1. websearch_search { query: "latest Bun SQLite API changes", limit: 5 }
2. websearch_search_and_crawl { query: "latest Bun SQLite API changes", extractTopN: 3 }
3. websearch_capture_screenshot { url: "https://example.com", waitFor: 2 }
```
