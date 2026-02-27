import { test, expect } from 'bun:test';
import { checkMCPs, isLocalBinaryServer } from '../src/checks.js';

test('isLocalBinaryServer identifies local binary servers', () => {
  // Local binary server (has command)
  const localServer = { command: 'node', args: ['script.js'] };
  expect(isLocalBinaryServer(localServer)).toBe(true);
});

test('isLocalBinaryServer identifies remote URL servers', () => {
  // Remote URL server (has url)
  const remoteServer = { url: 'http://localhost:3000' };
  expect(isLocalBinaryServer(remoteServer)).toBe(false);

  // Remote endpoint server (has endpoint)
  const endpointServer = { endpoint: 'https://api.example.com' };
  expect(isLocalBinaryServer(endpointServer)).toBe(false);
});

test('isLocalBinaryServer handles null/undefined', () => {
  expect(isLocalBinaryServer(null)).toBe(false);
  expect(isLocalBinaryServer(undefined)).toBe(false);
  expect(isLocalBinaryServer({})).toBe(true); // Default to local if unclear
});

test('checkMCPs respects enabled flag', () => {
  const mcpConfig = {
    'enabled-mcp': { command: 'node', enabled: true },
    'disabled-mcp': { command: 'node', enabled: false },
  };

  // Should not fail for disabled MCPs even if binary doesn't exist
  const result = checkMCPs(['disabled-mcp'], mcpConfig);
  
  // disabled-mcp should not appear in issues since it's disabled
  const disabledIssues = result.issues.filter(i => i.mcp === 'disabled-mcp');
  expect(disabledIssues.length).toBe(0);
});

test('checkMCPs skips remote URL servers', () => {
  const mcpConfig = {
    'remote-mcp': { url: 'http://localhost:3000', enabled: true },
  };

  // Should not fail for remote MCPs even if binary doesn't exist
  const result = checkMCPs(['remote-mcp'], mcpConfig);
  
  // remote-mcp should not appear in issues since it's remote
  const remoteIssues = result.issues.filter(i => i.mcp === 'remote-mcp');
  expect(remoteIssues.length).toBe(0);
});
