'use client';

import { useState, useCallback } from 'react';

interface QueryResult {
  type: 'node' | 'edge' | 'pattern' | 'skill' | 'error' | 'summary';
  data: any;
  confidence?: number;
}

export function JarvisQuery() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QueryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{query: string; results: QueryResult[]}[]>([]);

  const exampleQueries = [
    "What errors occur most frequently?",
    "Show me failed debugging attempts",
    "Which skills have lowest success rate?",
    "Sessions related to TypeScript errors",
    "Tools used in architecture decisions",
    "Recent anti-patterns detected",
    "Most successful skill combinations",
    "Errors in session [session-id]",
  ];

  const executeQuery = useCallback(async (q: string) => {
    if (!q.trim()) return;
    
    setLoading(true);
    setQuery(q);
    
    try {
      // Parse the query and fetch relevant data
      const lowerQ = q.toLowerCase();
      const queryResults: QueryResult[] = [];
      
      // Fetch all data sources in parallel
      const [graphRes, learningRes, skillsRes] = await Promise.all([
        fetch('/api/memory-graph'),
        fetch('/api/learning'),
        fetch('/api/skills').catch(() => null)
      ]);
      
      const graphData = await graphRes.json();
      const learningData = await learningRes.json();
      const skillsData = skillsRes ? await skillsRes.json() : null;
      
      // Query: errors/failures
      if (lowerQ.includes('error') || lowerQ.includes('fail')) {
        queryResults.push({
          type: 'error',
          data: learningData?.anti_patterns || { items: [] },
          confidence: 0.95
        });
        
        // Add graph errors
        const errorNodes = graphData.nodes?.filter((n: any) => n.type === 'error') || [];
        queryResults.push({
          type: 'node',
          data: { errors: errorNodes, count: errorNodes.length },
          confidence: 0.90
        });
      }
      
      // Query: skills/success rate
      if (lowerQ.includes('skill') || lowerQ.includes('success') || lowerQ.includes('rate')) {
        if (skillsData?.general_skills) {
          queryResults.push({
            type: 'skill',
            data: skillsData.general_skills,
            confidence: 0.95
          });
        }
        if (learningData?.positive_patterns) {
          queryResults.push({
            type: 'pattern',
            data: learningData.positive_patterns,
            confidence: 0.85
          });
        }
      }
      
      // Query: sessions
      if (lowerQ.includes('session')) {
        const sessionNodes = graphData.nodes?.filter((n: any) => n.type === 'session') || [];
        queryResults.push({
          type: 'node',
          data: { sessions: sessionNodes, count: sessionNodes.length },
          confidence: 0.95
        });
      }
      
      // Query: tools/agents
      if (lowerQ.includes('tool') || lowerQ.includes('agent')) {
        const toolNodes = graphData.nodes?.filter((n: any) => n.type === 'tool') || [];
        const agentNodes = graphData.nodes?.filter((n: any) => n.type === 'agent') || [];
        queryResults.push({
          type: 'node',
          data: { tools: toolNodes, agents: agentNodes },
          confidence: 0.90
        });
      }
      
      // Query: patterns/anti-patterns
      if (lowerQ.includes('pattern') || lowerQ.includes('anti')) {
        queryResults.push({
          type: 'pattern',
          data: learningData?.anti_patterns || { items: [] },
          confidence: 0.95
        });
      }
      
      // Default: show summary
      if (queryResults.length === 0) {
        queryResults.push({
          type: 'summary',
          data: {
            nodes: graphData.nodes?.length || 0,
            edges: graphData.edges?.length || 0,
            antiPatterns: learningData?.anti_patterns?.total || 0,
            positivePatterns: learningData?.positive_patterns?.total || 0,
            skills: skillsData?.stats?.total_skills || 0,
          },
          confidence: 1.0
        });
      }
      
      setResults(queryResults);
      setHistory(prev => [{ query: q, results: queryResults }, ...prev.slice(0, 9)]);
      
    } catch (err) {
      console.error('Query error:', err);
      setResults([{
        type: 'error',
        data: { message: String(err) },
        confidence: 0
      }]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Query Input */}
      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && executeQuery(query)}
            placeholder="Ask JARVIS about your knowledge graph..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => executeQuery(query)}
            disabled={loading || !query.trim()}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg font-medium"
          >
            {loading ? '⏳' : '🔍 Query'}
          </button>
        </div>
        
        {/* Example Queries */}
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-zinc-500">Try:</span>
          {exampleQueries.map((eq, i) => (
            <button
              key={i}
              onClick={() => executeQuery(eq)}
              className="text-xs px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-full transition-colors"
            >
              {eq}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-zinc-200">📊 Query Results</h3>
          
          {results.map((result, i) => (
            <div key={i} className="bg-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-zinc-300 capitalize">
                  {result.type === 'summary' && '📈 Summary'}
                  {result.type === 'node' && '🔷 Nodes'}
                  {result.type === 'edge' && '🔗 Edges'}
                  {result.type === 'pattern' && '📋 Patterns'}
                  {result.type === 'skill' && '🎯 Skills'}
                  {result.type === 'error' && '❌ Errors'}
                </span>
                {result.confidence !== undefined && (
                  <span className={`text-xs px-2 py-1 rounded ${
                    result.confidence >= 0.9 ? 'bg-emerald-600/20 text-emerald-400' :
                    result.confidence >= 0.7 ? 'bg-yellow-600/20 text-yellow-400' :
                    'bg-red-600/20 text-red-400'
                  }`}>
                    {Math.round(result.confidence * 100)}% confidence
                  </span>
                )}
              </div>
              
              {/* Summary Display */}
              {result.type === 'summary' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-400">{result.data.nodes}</div>
                    <div className="text-xs text-zinc-500">Nodes</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-400">{result.data.edges}</div>
                    <div className="text-xs text-zinc-500">Edges</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-400">{result.data.antiPatterns}</div>
                    <div className="text-xs text-zinc-500">Anti-Patterns</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-400">{result.data.skills}</div>
                    <div className="text-xs text-zinc-500">Skills</div>
                  </div>
                </div>
              )}
              
              {/* Errors/Anti-Patterns */}
              {result.type === 'error' && result.data.items && (
                <div className="space-y-2">
                  {result.data.items.slice(0, 5).map((item: any, j: number) => (
                    <div key={j} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-300">{item.type}</span>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          item.severity === 'high' ? 'bg-red-600/20 text-red-400' :
                          item.severity === 'medium' ? 'bg-yellow-600/20 text-yellow-400' :
                          'bg-zinc-600 text-zinc-400'
                        }`}>
                          {item.severity}
                        </span>
                        <span className="text-zinc-500">×{item.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Skills */}
              {result.type === 'skill' && Array.isArray(result.data) && (
                <div className="space-y-2">
                  {result.data.slice(0, 5).map((skill: any, j: number) => (
                    <div key={j} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-300">{skill.name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`${
                          skill.success_rate >= 0.8 ? 'text-emerald-400' :
                          skill.success_rate >= 0.6 ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {(skill.success_rate * 100).toFixed(0)}%
                        </span>
                        <span className="text-zinc-500">({skill.usage_count} uses)</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Nodes */}
              {result.type === 'node' && result.data.count !== undefined && (
                <div className="text-zinc-400 text-sm">
                  Found {result.data.count} nodes
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Query History */}
      {history.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-500">Recent Queries</h3>
          <div className="flex flex-wrap gap-2">
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => {
                  setQuery(h.query);
                  setResults(h.results);
                }}
                className="text-xs px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-full"
              >
                {h.query.slice(0, 30)}...
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && results.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">🤖</div>
          <h3 className="text-lg font-medium text-zinc-300">Ask JARVIS</h3>
          <p className="text-zinc-500 mt-2">
            Query your knowledge graph, patterns, and skills using natural language
          </p>
        </div>
      )}
    </div>
  );
}
