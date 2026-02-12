'use strict';

const fs = require('fs');
const path = require('path');

// ─── JSON Export ────────────────────────────────────────────────────────────

/**
 * Export graph to JSON string.
 * @param {{ nodes: object[], edges: object[], meta: object }} graph
 * @param {{ pretty?: boolean }} opts
 * @returns {string}
 */
function toJSON(graph, opts = {}) {
  const indent = opts.pretty !== false ? 2 : 0;
  return JSON.stringify(graph, null, indent);
}

// ─── DOT (Graphviz) Export ──────────────────────────────────────────────────

/**
 * Export graph to Graphviz DOT format.
 * Produces a bipartite layout: sessions on the left, errors on the right.
 *
 * @param {{ nodes: object[], edges: object[], meta: object }} graph
 * @param {{ title?: string, rankdir?: string }} opts
 * @returns {string}
 */
function toDOT(graph, opts = {}) {
  const title = opts.title || 'OpenCode Memory Graph';
  const rankdir = opts.rankdir || 'LR';
  const lines = [];

  lines.push(`digraph "${escDot(title)}" {`);
  lines.push(`  rankdir=${rankdir};`);
  lines.push(`  node [fontname="Helvetica", fontsize=10];`);
  lines.push(`  edge [fontname="Helvetica", fontsize=8];`);
  lines.push('');

  // Session nodes (box shape, light blue)
  const sessions = graph.nodes.filter((n) => n.type === 'session');
  const errors = graph.nodes.filter((n) => n.type === 'error');

  if (sessions.length) {
    lines.push('  // Session nodes');
    lines.push('  subgraph cluster_sessions {');
    lines.push('    label="Sessions";');
    lines.push('    style=dashed;');
    lines.push('    color="#4A90D9";');
    for (const s of sessions) {
      const label = `${s.id}\\nerrors: ${s.error_count}`;
      lines.push(`    "${escDot(s.id)}" [shape=box, style=filled, fillcolor="#D6EAF8", label="${label}"];`);
    }
    lines.push('  }');
    lines.push('');
  }

  // Error nodes (ellipse, light red)
  if (errors.length) {
    lines.push('  // Error nodes');
    lines.push('  subgraph cluster_errors {');
    lines.push('    label="Errors";');
    lines.push('    style=dashed;');
    lines.push('    color="#E74C3C";');
    for (const e of errors) {
      const label = `${e.id}\\ncount: ${e.count}`;
      lines.push(`    "${escDot(e.id)}" [shape=ellipse, style=filled, fillcolor="#FADBD8", label="${label}"];`);
    }
    lines.push('  }');
    lines.push('');
  }

  // Edges
  if (graph.edges.length) {
    lines.push('  // Edges (session -> error)');
    for (const edge of graph.edges) {
      const penwidth = Math.min(1 + edge.weight * 0.5, 6).toFixed(1);
      lines.push(
        `  "${escDot(edge.from)}" -> "${escDot(edge.to)}" [label="${edge.weight}", penwidth=${penwidth}];`,
      );
    }
  }

  lines.push('}');
  return lines.join('\n');
}

// ─── CSV Export ─────────────────────────────────────────────────────────────

/**
 * Export graph to CSV. Returns three sections: nodes, edges, and a frequency summary.
 *
 * @param {{ nodes: object[], edges: object[], meta: object }} graph
 * @param {{ section?: 'nodes'|'edges'|'frequency'|'all' }} opts
 * @returns {string}
 */
function toCSV(graph, opts = {}) {
  const section = opts.section || 'all';
  const parts = [];

  if (section === 'all' || section === 'nodes') {
    parts.push('# Nodes');
    parts.push('id,type,count_or_error_count,first_seen,last_seen');
    for (const n of graph.nodes) {
      const count = n.type === 'session' ? n.error_count : n.count;
      parts.push(
        [csvEsc(n.id), n.type, count, csvEsc(n.first_seen || ''), csvEsc(n.last_seen || '')].join(','),
      );
    }
    parts.push('');
  }

  if (section === 'all' || section === 'edges') {
    parts.push('# Edges');
    parts.push('from_session,to_error,weight,first_seen,last_seen');
    for (const e of graph.edges) {
      parts.push(
        [csvEsc(e.from), csvEsc(e.to), e.weight, csvEsc(e.first_seen || ''), csvEsc(e.last_seen || '')].join(','),
      );
    }
    parts.push('');
  }

  if (section === 'all' || section === 'frequency') {
    parts.push('# Error Frequency (descending)');
    parts.push('error_type,total_count,first_seen,last_seen');
    const errorNodes = graph.nodes
      .filter((n) => n.type === 'error')
      .sort((a, b) => b.count - a.count);
    for (const e of errorNodes) {
      parts.push([csvEsc(e.id), e.count, csvEsc(e.first_seen || ''), csvEsc(e.last_seen || '')].join(','));
    }
  }

  return parts.join('\n');
}

// ─── File Writer ────────────────────────────────────────────────────────────

/**
 * Write exported content to a file.
 * @param {string} content
 * @param {string} outputPath
 */
function writeExport(content, outputPath) {
  const resolved = path.resolve(outputPath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(resolved, content, 'utf-8');
  return resolved;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escDot(s) {
  return String(s).replace(/"/g, '\\"');
}

function csvEsc(s) {
  const str = String(s);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

module.exports = { toJSON, toDOT, toCSV, writeExport };
