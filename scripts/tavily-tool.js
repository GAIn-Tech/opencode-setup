#!/usr/bin/env bun

/**
 * Tavily CLI Wrapper
 * 
 * Replaces: mcp_tavily tools
 * Calls: Tavily API via fetch
 * 
 * Usage: node tavily-tool.js search <query> [options]
 * 
 * Options:
 *   --max-results <N>    Maximum results (default: 10)
 *   --search-depth <basic|advanced> (default: basic)
 *   --include-answers    Include AI-generated answers
 *   --time-range <day|week|month|year> Time range filter
 * 
 * Outputs: JSON search results
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (!command || command !== 'search') {
  console.error('Error: Command is required (currently only "search" supported)');
  console.error('Usage: node tavily-tool.js search <query> [options]');
  console.error('Options:');
  console.error('  --max-results <N>    Maximum results (default: 10)');
  console.error('  --search-depth <basic|advanced> (default: basic)');
  console.error('  --include-answers    Include AI-generated answers');
  console.error('  --time-range <day|week|month|year> Time range filter');
  process.exit(1);
}

// Get query from arguments
let query = '';
let maxResults = 10;
let searchDepth = 'basic';
let includeAnswers = false;
let timeRange = null;

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--max-results' && i + 1 < args.length) {
    maxResults = parseInt(args[++i], 10);
  } else if (args[i] === '--search-depth' && i + 1 < args.length) {
    searchDepth = args[++i];
  } else if (args[i] === '--include-answers') {
    includeAnswers = true;
  } else if (args[i] === '--time-range' && i + 1 < args.length) {
    timeRange = args[++i];
  } else if (!query) {
    query = args[i];
  }
}

if (!query) {
  console.error('Error: Search query is required');
  console.error('Usage: node tavily-tool.js search <query> [options]');
  process.exit(1);
}

// Check for Tavily API key
const apiKey = process.env.TAVILY_API_KEY;
if (!apiKey) {
  console.error('Error: TAVILY_API_KEY environment variable not set');
  console.error('Get an API key from https://app.tavily.com/');
  process.exit(1);
}

// Call Tavily API
async function searchTavily(query, options = {}) {
  const url = 'https://api.tavily.com/search';
  
  const requestBody = {
    api_key: apiKey,
    query,
    max_results: options.maxResults || 10,
    search_depth: options.searchDepth || 'basic',
    include_answer: options.includeAnswers || false,
    time_range: options.timeRange || null
  };
  
  console.error(`Tavily API: Searching "${query}"`);
  console.error(`Options: ${JSON.stringify(options)}`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tavily API error ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    
    // Transform to MCP-compatible format
    const transformed = {
      query: result.query,
      answer: result.answer,
      results: (result.results || []).map(item => ({
        title: item.title,
        url: item.url,
        content: item.content,
        score: item.score,
        publishedDate: item.published_date
      })),
      images: result.images || [],
      responseTime: result.response_time,
      totalResults: (result.results || []).length
    };
    
    return transformed;
  } catch (error) {
    throw new Error(`Tavily API request failed: ${error.message}`);
  }
}

// Mock implementation for testing (when no API key)
async function mockSearch(query, options = {}) {
  console.error(`Mock Tavily search: "${query}"`);
  console.error(`Options: ${JSON.stringify(options)}`);
  
  const mockResults = [
    {
      title: `Search result 1 for "${query}"`,
      url: 'https://example.com/result1',
      content: `This is mock content related to ${query}.`,
      score: 0.95,
      publishedDate: new Date().toISOString().split('T')[0]
    },
    {
      title: `Search result 2 for "${query}"`,
      url: 'https://example.com/result2',
      content: `Another mock result about ${query}.`,
      score: 0.87,
      publishedDate: new Date().toISOString().split('T')[0]
    },
    {
      title: `Search result 3 for "${query}"`,
      url: 'https://example.com/result3',
      content: `Additional information on ${query}.`,
      score: 0.76,
      publishedDate: new Date().toISOString().split('T')[0]
    }
  ];
  
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        query,
        answer: `Mock answer about ${query}. This would be AI-generated if --include-answers was used.`,
        results: mockResults.slice(0, options.maxResults || 3),
        images: [],
        responseTime: 0.5,
        totalResults: mockResults.length
      });
    }, 300);
  });
}

// Main execution
async function main() {
  try {
    const options = {
      maxResults,
      searchDepth,
      includeAnswers,
      timeRange
    };
    
    let result;
    
    if (apiKey && apiKey !== 'mock') {
      result = await searchTavily(query, options);
    } else {
      console.error('Warning: Using mock implementation (no valid TAVILY_API_KEY)');
      result = await mockSearch(query, options);
    }
    
    // Output JSON
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(`Uncaught error: ${error.message}`);
  process.exit(1);
});

// Run main function
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;