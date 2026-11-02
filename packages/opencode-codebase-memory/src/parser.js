'use strict';
const { parse } = require('@typescript-eslint/typescript-estree');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SUPPORTED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts']);

function nodeId(file, line, name) {
  return crypto.createHash('sha256').update(`${file}:${line}:${name}`).digest('hex').slice(0, 16);
}

function getSignature(node, name) {
  const params = (node.params || []).map(p => {
    if (p.type === 'Identifier') return p.typeAnnotation ? `${p.name}: ${typeStr(p.typeAnnotation.typeAnnotation)}` : p.name;
    if (p.type === 'AssignmentPattern') return p.left?.name ?? '...';
    if (p.type === 'RestElement') return `...${p.argument?.name ?? ''}`;
    return '...';
  }).join(', ');
  return `${name}(${params})`;
}

function typeStr(node) {
  if (!node) return 'any';
  if (node.type === 'TSStringKeyword') return 'string';
  if (node.type === 'TSNumberKeyword') return 'number';
  if (node.type === 'TSBooleanKeyword') return 'boolean';
  if (node.type === 'TSTypeReference') return node.typeName?.name ?? 'unknown';
  return 'any';
}

function extractDocstring(comments, line) {
  if (!comments) return null;
  const preceding = comments.filter(c => c.type === 'Block' && c.loc.end.line === line - 1);
  return preceding.length ? preceding[preceding.length - 1].value.trim().split('\n')[0].replace(/^\*+\s?/, '') : null;
}

function parseFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) return { nodes: [], edges: [] };

  let src;
  try { src = fs.readFileSync(filePath, 'utf-8'); } catch { return { nodes: [], edges: [] }; }

  let ast;
  try {
    ast = parse(src, {
      jsx: ext === '.jsx' || ext === '.tsx',
      loc: true,
      comment: true,
      errorOnUnknownASTType: false,
      allowInvalidAST: true,
    });
  } catch {
    return { nodes: [], edges: [] };
  }

  const nodes = [];
  const edges = [];
  const nodesByName = new Map();

  function visit(node, parentId = null, parentName = null) {
    if (!node || typeof node !== 'object') return;

    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'TSDeclareFunction'
    ) {
      const name = node.id?.name ?? parentName ?? '<anonymous>';
      const line = node.loc?.start.line ?? 0;
      const id = nodeId(filePath, line, name);
      const kind = parentId ? 'method' : 'function';
      const sig = getSignature(node, name);
      const doc = extractDocstring(ast.comments, line);
      nodes.push({ id, name, kind, file: filePath, line, signature: sig, docstring: doc, language: ext.slice(1) });
      nodesByName.set(name, id);
      if (node.body) visitForCalls(node.body, id);
      return;
    }

    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      const name = node.id?.name ?? '<anonymous>';
      const line = node.loc?.start.line ?? 0;
      const id = nodeId(filePath, line, name);
      nodes.push({ id, name, kind: 'class', file: filePath, line, signature: name, language: ext.slice(1) });
      nodesByName.set(name, id);

      if (node.superClass?.name) {
        edges.push({ from_id: id, to_id: null, to_name: node.superClass.name, kind: 'extends', file: filePath, line });
      }

      if (node.body?.body) {
        for (const member of node.body.body) {
          if (member.type === 'MethodDefinition' || member.type === 'PropertyDefinition') {
            const mName = member.key?.name ?? member.key?.value ?? '<method>';
            const mLine = member.loc?.start.line ?? 0;
            const mId = nodeId(filePath, mLine, `${name}.${mName}`);
            const mSig = member.value ? getSignature(member.value, mName) : mName;
            nodes.push({ id: mId, name: mName, kind: 'method', file: filePath, line: mLine, signature: mSig, language: ext.slice(1) });
            edges.push({ from_id: id, to_id: mId, to_name: mName, kind: 'contains', file: filePath, line: mLine });
            if (member.value?.body) visitForCalls(member.value.body, mId);
          }
        }
      }
      return;
    }

    if (node.type === 'VariableDeclarator' && node.init &&
        (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')) {
      const name = node.id?.name;
      if (name) {
        const line = node.loc?.start.line ?? 0;
        const id = nodeId(filePath, line, name);
        const sig = getSignature(node.init, name);
        nodes.push({ id, name, kind: 'function', file: filePath, line, signature: sig, language: ext.slice(1) });
        nodesByName.set(name, id);
        if (node.init.body) visitForCalls(node.init.body, id);
      }
      return;
    }

    if (node.type === 'ImportDeclaration') {
      const src2 = node.source?.value;
      if (src2) {
        const importerPseudoId = nodeId(filePath, 0, 'FILE');
        edges.push({ from_id: importerPseudoId, to_id: null, to_name: src2, kind: 'imports', file: filePath, line: node.loc?.start.line ?? 0 });
      }
      return;
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(c => visit(c, parentId, parentName));
      else if (child && typeof child === 'object' && child.type) visit(child, parentId, parentName);
    }
  }

  function visitForCalls(body, callerId) {
    if (!body) return;
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'CallExpression') {
        const callee = node.callee;
        const calleeName = callee.type === 'Identifier' ? callee.name
          : callee.type === 'MemberExpression' ? `${callee.object?.name ?? ''}.${callee.property?.name ?? ''}` : null;
        if (calleeName) {
          edges.push({ from_id: callerId, to_id: null, to_name: calleeName, kind: 'calls', file: filePath, line: node.loc?.start.line ?? 0 });
        }
      }
      for (const key of Object.keys(node)) {
        if (key === 'parent') continue;
        const child = node[key];
        if (Array.isArray(child)) child.forEach(walk);
        else if (child && typeof child === 'object' && child.type) walk(child);
      }
    };
    walk(body);
  }

  visit(ast.body ? { type: 'Program', body: ast.body } : ast);

  for (const edge of edges) {
    if (!edge.to_id && edge.to_name && nodesByName.has(edge.to_name)) {
      edge.to_id = nodesByName.get(edge.to_name);
    }
  }

  return { nodes, edges };
}

module.exports = { parseFile, SUPPORTED_EXTENSIONS };
