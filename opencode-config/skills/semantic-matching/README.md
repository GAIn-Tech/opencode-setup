# Semantic Matching Data

Static data files for semantic skill matching. Used by `opencode-skill-rl-manager` to improve skill selection through synonym expansion and domain signal detection.

## Files

### `synonyms.json`

Concept clusters mapping a canonical term to an array of synonyms. Used for query expansion during skill matching.

**Format:**
```json
{
  "<canonical-concept>": ["synonym1", "synonym2", ...]
}
```

**Example:**
```json
{
  "debugging": ["fix", "troubleshoot", "diagnose", "investigate", ...]
}
```

Each cluster groups related terms so that a query containing any synonym can match skills tagged with the canonical concept. No ML or embeddings — pure string matching against these tables.

### `domain-signals.json`

Maps each of the 14 registry skill categories to an array of signal words. Used to infer task domain from natural language queries.

**Format:**
```json
{
  "<category>": ["signal1", "signal2", ...]
}
```

**Categories:** planning, implementation, debugging, testing, review, git, browser, research, analysis, memory, reasoning, meta, observability, optimization.

Each category has ≥5 signal words derived from registry skill triggers, tags, and common terminology.

## Constraints

- No ML models, embeddings, or vector search
- No external API calls
- Max 500 entries per file
- Pure JSON — consumed via `require()` or `JSON.parse()`

## Tests

Validated by `packages/opencode-skill-rl-manager/test/synonym-tables.test.js`.
