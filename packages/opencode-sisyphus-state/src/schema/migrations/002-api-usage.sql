-- Migration 002: API Usage Tracking Tables
-- Tracks provider quotas, usage, and routing decisions

-- Provider quota configuration
CREATE TABLE IF NOT EXISTS provider_quotas (
    provider_id TEXT PRIMARY KEY,  -- 'anthropic', 'openai', 'google', etc.
    quota_type TEXT NOT NULL,       -- 'monthly', 'daily', 'request-based'
    quota_limit INTEGER,            -- token count or request count (NULL for request-based)
    quota_period TEXT,              -- 'month', 'day', null for request-based
    warning_threshold REAL DEFAULT 0.8,  -- Alert at 80% usage
    critical_threshold REAL DEFAULT 0.95, -- Critical at 95% usage
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API usage tracking (aggregated)
CREATE TABLE IF NOT EXISTS api_usage (
    usage_id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    session_id TEXT,
    model_id TEXT,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    tokens_total INTEGER GENERATED ALWAYS AS (tokens_input + tokens_output) STORED,
    cost_estimate REAL,  -- Estimated cost in USD
    request_count INTEGER DEFAULT 1,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES provider_quotas(provider_id)
);

-- Quota usage summaries (for fast lookups)
CREATE TABLE IF NOT EXISTS quota_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    period_start DATETIME NOT NULL,
    period_end DATETIME NOT NULL,
    tokens_used INTEGER DEFAULT 0,
    tokens_remaining INTEGER,
    percent_used REAL,
    status TEXT CHECK(status IN ('healthy', 'warning', 'critical', 'exhausted')),
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES provider_quotas(provider_id)
);

-- Routing decisions (audit trail)
CREATE TABLE IF NOT EXISTS routing_decisions (
    decision_id TEXT PRIMARY KEY,
    session_id TEXT,
    task_id TEXT,
    requested_category TEXT,
    requested_skills TEXT,  -- JSON array
    original_selection TEXT,  -- What would have been selected
    final_selection TEXT,     -- What was selected after quota check
    quota_factors TEXT,       -- JSON of which quotas influenced decision
    fallback_applied BOOLEAN DEFAULT FALSE,
    reason TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_usage_provider ON api_usage(provider_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_api_usage_session ON api_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_quota_snapshots_provider ON quota_snapshots(provider_id, period_start);
CREATE INDEX IF NOT EXISTS idx_routing_session ON routing_decisions(session_id);

-- Update schema version
PRAGMA user_version = 2;
