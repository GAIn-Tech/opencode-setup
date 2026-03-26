#!/usr/bin/env bun

/**
 * GitHub CLI Wrapper
 * 
 * Replaces: mcp_github tools
 * Uses: gh command or direct GitHub API
 * 
 * Usage: node github-tool.js <command> [options]
 * 
 * Commands:
 *   list-issues <owner/repo> [--state open|closed|all] [--limit N]
 *   get-issue <owner/repo> <issue_number>
 *   create-comment <owner/repo> <issue_number> <comment>
 *   add-labels <owner/repo> <issue_number> <label1,label2,...>
 * 
 * Outputs: JSON result
 */

import {
  commandExists,
  runCommand,
  runCommandJson,
  printJson,
  fatal,
  installProcessErrorHandlers,
  toErrorMessage,
} from './lib/cli-runtime.mjs';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  fatal([
    'Command is required',
    'Usage: node github-tool.js <command> [options]',
    'Commands:',
    '  list-issues <owner/repo> [--state <state>] [--limit <N>]',
    '  get-issue <owner/repo> <issue_number>',
    '  create-comment <owner/repo> <issue_number> <comment>',
    '  add-labels <owner/repo> <issue_number> <label1,label2,...>',
  ].join('\n'));
}

// Check if gh command is available
async function checkGhCommand() {
  // Check if gh exists first to prevent ENOENT crash
  if (!commandExists('gh')) {
    return false;
  }

  try {
    await runCommand('gh', ['--version'], { stdio: 'pipe', shell: true });
    return true;
  } catch {
    return false;
  }
}

// Run gh command
async function runGhCommand(cmdArgs) {
  return runCommandJson('gh', cmdArgs, {
    stdio: 'pipe',
    shell: true,
    logCommand: true,
    parseMode: 'loose',
  });
}

// Fallback to direct GitHub API
async function runGitHubAPI(method, url, data = null) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable not set');
  }
  
  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'OpenCode-CLI-Wrapper'
  };
  
  const fullUrl = `https://api.github.com${url}`;
  
  console.error(`GitHub API: ${method} ${fullUrl}`);
  
  const options = {
    method,
    headers
  };
  
  if (data) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(data);
  }
  
  try {
    const response = await fetch(fullUrl, options);
    const text = await response.text();
    
    if (!response.ok) {
      throw new Error(`GitHub API error ${response.status}: ${text}`);
    }
    
    return text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`GitHub API request failed: ${error.message}`);
  }
}

// Command implementations
async function listIssues(repo, options = {}) {
  const ghAvailable = await checkGhCommand();
  
  if (ghAvailable) {
    const cmdArgs = ['issue', 'list', '--repo', repo, '--json', 'number,title,state,labels'];
    
    if (options.state) {
      cmdArgs.push('--state', options.state);
    }
    
    if (options.limit) {
      cmdArgs.push('--limit', options.limit.toString());
    }
    
    return runGhCommand(cmdArgs);
  } else {
    // Fallback to API
    let url = `/repos/${repo}/issues`;
    const params = new URLSearchParams();
    
    if (options.state) {
      params.append('state', options.state);
    }
    
    if (options.limit) {
      params.append('per_page', options.limit.toString());
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    return runGitHubAPI('GET', url);
  }
}

async function getIssue(repo, issueNumber) {
  const ghAvailable = await checkGhCommand();
  
  if (ghAvailable) {
    const cmdArgs = ['issue', 'view', '--repo', repo, issueNumber.toString(), '--json'];
    return runGhCommand(cmdArgs);
  } else {
    return runGitHubAPI('GET', `/repos/${repo}/issues/${issueNumber}`);
  }
}

async function createComment(repo, issueNumber, comment) {
  const ghAvailable = await checkGhCommand();
  
  if (ghAvailable) {
    const cmdArgs = ['issue', 'comment', '--repo', repo, issueNumber.toString(), '--body', comment];
    return runGhCommand(cmdArgs);
  } else {
    const data = { body: comment };
    return runGitHubAPI('POST', `/repos/${repo}/issues/${issueNumber}/comments`, data);
  }
}

async function addLabels(repo, issueNumber, labels) {
  const ghAvailable = await checkGhCommand();
  
  if (ghAvailable) {
    // gh doesn't have a direct add-labels command, so use API
    const labelArray = labels.split(',').map(l => l.trim());
    const data = { labels: labelArray };
    return runGitHubAPI('POST', `/repos/${repo}/issues/${issueNumber}/labels`, data);
  } else {
    const labelArray = labels.split(',').map(l => l.trim());
    const data = { labels: labelArray };
    return runGitHubAPI('POST', `/repos/${repo}/issues/${issueNumber}/labels`, data);
  }
}

// Main execution
async function main() {
  try {
    let result;
    
    switch (command) {
      case 'list-issues':
        if (args.length < 2) {
          throw new Error('Usage: list-issues <owner/repo> [--state <state>] [--limit <N>]');
        }
        
        const repo = args[1];
        const options = {};
        
        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--state' && i + 1 < args.length) {
            options.state = args[++i];
          } else if (args[i] === '--limit' && i + 1 < args.length) {
            options.limit = parseInt(args[++i], 10);
          }
        }
        
        result = await listIssues(repo, options);
        break;
        
      case 'get-issue':
        if (args.length < 3) {
          throw new Error('Usage: get-issue <owner/repo> <issue_number>');
        }
        
        result = await getIssue(args[1], parseInt(args[2], 10));
        break;
        
      case 'create-comment':
        if (args.length < 4) {
          throw new Error('Usage: create-comment <owner/repo> <issue_number> <comment>');
        }
        
        result = await createComment(args[1], parseInt(args[2], 10), args.slice(3).join(' '));
        break;
        
      case 'add-labels':
        if (args.length < 4) {
          throw new Error('Usage: add-labels <owner/repo> <issue_number> <label1,label2,...>');
        }
        
        result = await addLabels(args[1], parseInt(args[2], 10), args[3]);
        break;
        
      default:
        throw new Error(`Unknown command: ${command}`);
    }
    
    // Output JSON
    printJson(result);
    
  } catch (error) {
    fatal(toErrorMessage(error));
  }
}

installProcessErrorHandlers({ prefix: '[github-tool]' });

// Run main function
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;
