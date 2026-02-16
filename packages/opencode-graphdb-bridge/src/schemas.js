'use strict';

/**
 * Cypher DDL Schema Definitions
 *
 * Three schema domains for the goraphdb bridge:
 * 1. SESSION_ERROR_SCHEMA  — opencode-memory-graph: session → error relationships
 * 2. RUNBOOK_SCHEMA        — opencode-runbooks: error → remedy mappings
 * 3. EVAL_SCHEMA           — opencode-eval-harness: test → model → outcome relationships
 */

// ─── 1. Session/Error Schema (opencode-memory-graph) ────────────────────────
// Tracks coding sessions, errors encountered, and their occurrences.
// Session ─[ENCOUNTERED]→ Error ─[OCCURRED_IN]→ File
// Session ─[RESOLVED]→ Error

const SESSION_ERROR_SCHEMA = {
  name: 'session_error',
  description: 'Session → Error relationships for opencode-memory-graph',
  constraints: [
    `CREATE CONSTRAINT IF NOT EXISTS FOR (s:Session) REQUIRE s.sessionId IS UNIQUE`,
    `CREATE CONSTRAINT IF NOT EXISTS FOR (e:Error) REQUIRE e.errorHash IS UNIQUE`,
    `CREATE CONSTRAINT IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE`,
  ],
  indexes: [
    `CREATE INDEX IF NOT EXISTS FOR (s:Session) ON (s.startedAt)`,
    `CREATE INDEX IF NOT EXISTS FOR (e:Error) ON (e.type)`,
    `CREATE INDEX IF NOT EXISTS FOR (e:Error) ON (e.message)`,
    `CREATE INDEX IF NOT EXISTS FOR (f:File) ON (f.language)`,
  ],
  nodeTemplates: {
    Session: {
      labels: ['Session'],
      requiredProps: ['sessionId', 'startedAt'],
      optionalProps: ['endedAt', 'project', 'branch', 'model', 'totalTokens'],
    },
    Error: {
      labels: ['Error'],
      requiredProps: ['errorHash', 'type', 'message'],
      optionalProps: ['stack', 'severity', 'firstSeen', 'lastSeen', 'occurrenceCount'],
    },
    File: {
      labels: ['File'],
      requiredProps: ['path'],
      optionalProps: ['language', 'lastModified', 'lineCount'],
    },
  },
  edgeTemplates: {
    ENCOUNTERED: {
      from: 'Session',
      to: 'Error',
      requiredProps: ['timestamp'],
      optionalProps: ['context', 'lineNumber', 'resolved'],
    },
    OCCURRED_IN: {
      from: 'Error',
      to: 'File',
      requiredProps: [],
      optionalProps: ['lineNumber', 'column', 'functionName'],
    },
    RESOLVED: {
      from: 'Session',
      to: 'Error',
      requiredProps: ['resolvedAt'],
      optionalProps: ['resolutionMethod', 'timeToResolveMs'],
    },
  },
  queries: {
    /** Find all errors in a session */
    sessionErrors: `
      MATCH (s:Session {sessionId: $sessionId})-[r:ENCOUNTERED]->(e:Error)
      RETURN e, r ORDER BY r.timestamp DESC
    `,
    /** Find sessions with unresolved errors */
    unresolvedErrors: `
      MATCH (s:Session)-[enc:ENCOUNTERED]->(e:Error)
      WHERE NOT (s)-[:RESOLVED]->(e)
      RETURN s.sessionId, e.type, e.message, enc.timestamp
      ORDER BY enc.timestamp DESC
    `,
    /** Find recurring errors across sessions */
    recurringErrors: `
      MATCH (e:Error)<-[:ENCOUNTERED]-(s:Session)
      WITH e, count(DISTINCT s) AS sessionCount
      WHERE sessionCount > $minSessions
      RETURN e.type, e.message, sessionCount
      ORDER BY sessionCount DESC
    `,
    /** Error hotspot files */
    errorHotspots: `
      MATCH (e:Error)-[:OCCURRED_IN]->(f:File)
      WITH f, count(DISTINCT e) AS errorCount
      RETURN f.path, f.language, errorCount
      ORDER BY errorCount DESC LIMIT $limit
    `,
  },
};


// ─── 2. Runbook Schema (opencode-runbooks) ──────────────────────────────────
// Maps error types to remediation steps, forming error→remedy chains.
// ErrorType ─[HAS_REMEDY]→ Remedy ─[NEXT_STEP]→ Remedy
// Remedy ─[SUCCEEDED_FOR]→ ErrorType

const RUNBOOK_SCHEMA = {
  name: 'runbook',
  description: 'Error → Remedy mappings for opencode-runbooks',
  constraints: [
    `CREATE CONSTRAINT IF NOT EXISTS FOR (et:ErrorType) REQUIRE et.typeId IS UNIQUE`,
    `CREATE CONSTRAINT IF NOT EXISTS FOR (r:Remedy) REQUIRE r.remedyId IS UNIQUE`,
    `CREATE CONSTRAINT IF NOT EXISTS FOR (rb:Runbook) REQUIRE rb.runbookId IS UNIQUE`,
  ],
  indexes: [
    `CREATE INDEX IF NOT EXISTS FOR (et:ErrorType) ON (et.category)`,
    `CREATE INDEX IF NOT EXISTS FOR (et:ErrorType) ON (et.pattern)`,
    `CREATE INDEX IF NOT EXISTS FOR (r:Remedy) ON (r.type)`,
    `CREATE INDEX IF NOT EXISTS FOR (r:Remedy) ON (r.successRate)`,
  ],
  nodeTemplates: {
    ErrorType: {
      labels: ['ErrorType'],
      requiredProps: ['typeId', 'category', 'pattern'],
      optionalProps: ['description', 'severity', 'language', 'framework'],
    },
    Remedy: {
      labels: ['Remedy'],
      requiredProps: ['remedyId', 'type', 'description'],
      optionalProps: ['command', 'codeSnippet', 'successRate', 'avgTimeMs', 'source'],
    },
    Runbook: {
      labels: ['Runbook'],
      requiredProps: ['runbookId', 'name'],
      optionalProps: ['description', 'createdAt', 'updatedAt', 'version'],
    },
  },
  edgeTemplates: {
    HAS_REMEDY: {
      from: 'ErrorType',
      to: 'Remedy',
      requiredProps: [],
      optionalProps: ['priority', 'confidence', 'addedAt'],
    },
    NEXT_STEP: {
      from: 'Remedy',
      to: 'Remedy',
      requiredProps: ['order'],
      optionalProps: ['condition', 'description'],
    },
    SUCCEEDED_FOR: {
      from: 'Remedy',
      to: 'ErrorType',
      requiredProps: ['successCount'],
      optionalProps: ['failCount', 'lastUsed', 'avgTimeMs'],
    },
    BELONGS_TO: {
      from: 'ErrorType',
      to: 'Runbook',
      requiredProps: [],
      optionalProps: ['section'],
    },
  },
  queries: {
    /** Find remedies for an error pattern */
    findRemedies: `
      MATCH (et:ErrorType)-[:HAS_REMEDY]->(r:Remedy)
      WHERE et.pattern =~ $errorPattern OR et.category = $category
      RETURN et.category, r.description, r.command, r.successRate
      ORDER BY r.successRate DESC
    `,
    /** Get full remedy chain for an error type */
    remedyChain: `
      MATCH (et:ErrorType {typeId: $typeId})-[:HAS_REMEDY]->(first:Remedy)
      OPTIONAL MATCH path = (first)-[:NEXT_STEP*]->(next:Remedy)
      RETURN et.category, [first] + nodes(path) AS steps
    `,
    /** Top remedies by success rate */
    topRemedies: `
      MATCH (r:Remedy)-[s:SUCCEEDED_FOR]->(et:ErrorType)
      WITH r, sum(s.successCount) AS totalSuccess, sum(s.failCount) AS totalFail
      RETURN r.description, r.type, totalSuccess,
             toFloat(totalSuccess) / (totalSuccess + totalFail) AS rate
      ORDER BY rate DESC LIMIT $limit
    `,
    /** Errors without remedies */
    unremediedErrors: `
      MATCH (et:ErrorType)
      WHERE NOT (et)-[:HAS_REMEDY]->(:Remedy)
      RETURN et.typeId, et.category, et.pattern, et.severity
      ORDER BY et.severity DESC
    `,
  },
};


// ─── 3. Eval Schema (opencode-eval-harness) ────────────────────────────────
// Tracks evaluation tests, model runs, and results.
// TestCase ─[EVALUATED_BY]→ Model ─[PRODUCED]→ Result
// TestSuite ─[CONTAINS]→ TestCase
// Result ─[DEPENDS_ON]→ Result

const EVAL_SCHEMA = {
  name: 'eval',
  description: 'Test → Model → Outcome relationships for opencode-eval-harness',
  constraints: [
    `CREATE CONSTRAINT IF NOT EXISTS FOR (tc:TestCase) REQUIRE tc.testId IS UNIQUE`,
    `CREATE CONSTRAINT IF NOT EXISTS FOR (m:Model) REQUIRE m.modelId IS UNIQUE`,
    `CREATE CONSTRAINT IF NOT EXISTS FOR (r:Result) REQUIRE r.resultId IS UNIQUE`,
    `CREATE CONSTRAINT IF NOT EXISTS FOR (ts:TestSuite) REQUIRE ts.suiteId IS UNIQUE`,
  ],
  indexes: [
    `CREATE INDEX IF NOT EXISTS FOR (tc:TestCase) ON (tc.category)`,
    `CREATE INDEX IF NOT EXISTS FOR (m:Model) ON (m.provider)`,
    `CREATE INDEX IF NOT EXISTS FOR (r:Result) ON (r.outcome)`,
    `CREATE INDEX IF NOT EXISTS FOR (r:Result) ON (r.runAt)`,
  ],
  nodeTemplates: {
    TestCase: {
      labels: ['TestCase'],
      requiredProps: ['testId', 'name', 'category'],
      optionalProps: ['description', 'input', 'expectedOutput', 'difficulty', 'tags'],
    },
    Model: {
      labels: ['Model'],
      requiredProps: ['modelId', 'provider'],
      optionalProps: ['version', 'parameters', 'costPer1kTokens', 'maxTokens'],
    },
    Result: {
      labels: ['Result'],
      requiredProps: ['resultId', 'outcome', 'runAt'],
      optionalProps: [
        'score', 'latencyMs', 'tokensUsed', 'cost',
        'actualOutput', 'error', 'metadata',
      ],
    },
    TestSuite: {
      labels: ['TestSuite'],
      requiredProps: ['suiteId', 'name'],
      optionalProps: ['description', 'version', 'createdAt'],
    },
  },
  edgeTemplates: {
    EVALUATED_BY: {
      from: 'TestCase',
      to: 'Model',
      requiredProps: [],
      optionalProps: ['runCount', 'lastRunAt'],
    },
    PRODUCED: {
      from: 'Model',
      to: 'Result',
      requiredProps: ['testId'],
      optionalProps: ['runConfig', 'temperature', 'maxTokens'],
    },
    CONTAINS: {
      from: 'TestSuite',
      to: 'TestCase',
      requiredProps: [],
      optionalProps: ['order', 'weight'],
    },
    DEPENDS_ON: {
      from: 'Result',
      to: 'Result',
      requiredProps: [],
      optionalProps: ['dependencyType', 'description'],
    },
    FOR_TEST: {
      from: 'Result',
      to: 'TestCase',
      requiredProps: [],
      optionalProps: [],
    },
  },
  queries: {
    /** Model leaderboard for a test category */
    modelLeaderboard: `
      MATCH (tc:TestCase)-[:EVALUATED_BY]->(m:Model)-[:PRODUCED]->(r:Result)-[:FOR_TEST]->(tc)
      WHERE tc.category = $category AND r.outcome = 'pass'
      WITH m, count(r) AS passes, avg(r.score) AS avgScore, avg(r.latencyMs) AS avgLatency
      RETURN m.modelId, m.provider, passes, avgScore, avgLatency
      ORDER BY avgScore DESC, avgLatency ASC
    `,
    /** Test results for a specific model */
    modelResults: `
      MATCH (m:Model {modelId: $modelId})-[:PRODUCED]->(r:Result)-[:FOR_TEST]->(tc:TestCase)
      RETURN tc.name, tc.category, r.outcome, r.score, r.latencyMs, r.runAt
      ORDER BY r.runAt DESC
    `,
    /** Failing tests across all models */
    failingTests: `
      MATCH (tc:TestCase)<-[:FOR_TEST]-(r:Result {outcome: 'fail'})<-[:PRODUCED]-(m:Model)
      WITH tc, count(DISTINCT m) AS failingModels
      RETURN tc.testId, tc.name, tc.category, failingModels
      ORDER BY failingModels DESC LIMIT $limit
    `,
    /** Cost analysis per model */
    costAnalysis: `
      MATCH (m:Model)-[:PRODUCED]->(r:Result)
      WITH m, sum(r.cost) AS totalCost, count(r) AS runCount, avg(r.tokensUsed) AS avgTokens
      RETURN m.modelId, m.provider, totalCost, runCount, avgTokens
      ORDER BY totalCost DESC
    `,
    /** Dependency chain for a result */
    resultDependencies: `
      MATCH path = (r:Result {resultId: $resultId})-[:DEPENDS_ON*]->(dep:Result)
      RETURN [node IN nodes(path) | node.resultId] AS chain,
             length(path) AS depth
      ORDER BY depth DESC
    `,
  },
};


// ─── Schema Registry ────────────────────────────────────────────────────────

const ALL_SCHEMAS = {
  session_error: SESSION_ERROR_SCHEMA,
  runbook: RUNBOOK_SCHEMA,
  eval: EVAL_SCHEMA,
};

/**
 * Get all DDL statements (constraints + indexes) for a schema.
 * @param {string} schemaName - 'session_error' | 'runbook' | 'eval'
 * @returns {string[]} array of Cypher DDL statements
 */
function getSchemaDDL(schemaName) {
  const schema = ALL_SCHEMAS[schemaName];
  if (!schema) {
    throw new Error(`Unknown schema: ${schemaName}. Available: ${Object.keys(ALL_SCHEMAS).join(', ')}`);
  }
  return [...schema.constraints, ...schema.indexes];
}

/**
 * Get all DDL statements for all schemas.
 * @returns {string[]} array of all Cypher DDL statements
 */
function getAllDDL() {
  const ddl = [];
  for (const schemaName of Object.keys(ALL_SCHEMAS)) {
    ddl.push(...getSchemaDDL(schemaName));
  }
  return ddl;
}

/**
 * Get a named query from a schema.
 * @param {string} schemaName - schema name
 * @param {string} queryName - query name within the schema
 * @returns {string} Cypher query string
 */
function getQuery(schemaName, queryName) {
  const schema = ALL_SCHEMAS[schemaName];
  if (!schema) {
    throw new Error(`Unknown schema: ${schemaName}`);
  }
  const query = schema.queries[queryName];
  if (!query) {
    throw new Error(
      `Unknown query '${queryName}' in schema '${schemaName}'. Available: ${Object.keys(schema.queries).join(', ')}`
    );
  }
  return query.trim();
}

/**
 * Get node template for validation.
 * @param {string} schemaName
 * @param {string} nodeType
 * @returns {Object} node template
 */
function getNodeTemplate(schemaName, nodeType) {
  const schema = ALL_SCHEMAS[schemaName];
  if (!schema) throw new Error(`Unknown schema: ${schemaName}`);
  const tpl = schema.nodeTemplates[nodeType];
  if (!tpl) {
    throw new Error(
      `Unknown node type '${nodeType}' in schema '${schemaName}'. Available: ${Object.keys(schema.nodeTemplates).join(', ')}`
    );
  }
  return tpl;
}

/**
 * Validate node properties against schema template.
 * @param {string} schemaName
 * @param {string} nodeType
 * @param {Object} props - properties to validate
 * @returns {{ valid: boolean, missing: string[], extra: string[] }}
 */
function validateNodeProps(schemaName, nodeType, props) {
  const tpl = getNodeTemplate(schemaName, nodeType);
  const propKeys = Object.keys(props);
  const allKnown = [...tpl.requiredProps, ...tpl.optionalProps];
  const missing = tpl.requiredProps.filter((k) => !(k in props));
  const extra = propKeys.filter((k) => !allKnown.includes(k));
  return { valid: missing.length === 0, missing, extra };
}

module.exports = {
  SESSION_ERROR_SCHEMA,
  RUNBOOK_SCHEMA,
  EVAL_SCHEMA,
  ALL_SCHEMAS,
  getSchemaDDL,
  getAllDDL,
  getQuery,
  getNodeTemplate,
  validateNodeProps,
};
