# @tarquinen/opencode-dcp

Dynamic Context Pruning — automatically reduces token usage by pruning irrelevant context from the conversation window.

- **Package**: `@tarquinen/opencode-dcp@latest`
- **Source**: npm registry
- **Purpose**: Reduces token consumption by intelligently pruning context that isn't relevant to the current task

## How It Works

DCP analyzes the current conversation context and identifies segments that are no longer relevant to the active task. It then prunes those segments, reclaiming token budget without losing critical information.

### Key Capabilities

1. **Relevance scoring**: Assigns relevance scores to context segments based on the current task
2. **Selective pruning**: Removes low-relevance segments while preserving high-value context
3. **Token savings**: Typically achieves 30-50% token reduction on long conversations
4. **Non-destructive**: Original context is preserved — pruning only affects what's sent to the model

### Integration Points

- **ContextBridge**: The `evaluateContextBudget()` method on IntegrationLayer returns advisory signals (`compress`, `compress_urgent`, `none`) that indicate when DCP should be invoked
- **Context Governor**: Budget thresholds (65% warn, 80% critical) trigger DCP recommendations
- **Distill MCP**: Works alongside distill for AST-aware compression of code context

### When DCP Activates

| Budget % | Action | DCP Role |
|----------|--------|----------|
| < 65%    | none   | DCP not needed |
| 65-80%   | compress | DCP prunes low-relevance context proactively |
| >= 80%   | compress_urgent | DCP aggressively prunes to reclaim budget |

### Configuration

DCP is configured as a plugin in `opencode.json`:

```json
{
  "plugin": ["@tarquinen/opencode-dcp@latest"]
}
```

No additional configuration required — DCP operates automatically based on context signals.
