'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { InteractiveKnowledgeGraph } from './InteractiveKnowledgeGraph';

interface TaxonomyNode {
  name: string;
  children?: TaxonomyNode[];
  count?: number;
}

interface KnowledgeData {
  nodes: Array<{ id: string; type: string; count: number }>;
  edges: Array<{ from: string; to: string; type: string; weight: number }>;
  taxonomy: TaxonomyNode;
  nodeTypes: Record<string, number>;
  edgeTypes: Record<string, number>;
  stats: {
    totalNodes: number;
    totalEdges: number;
    sessions: number;
    errors: number;
    agents: number;
    tools: number;
    models: number;
    skills: number;
    patterns: number;
    concepts: number;
    solutions: number;
    templates: number;
    profiles: number;
    rules: number;
  };
}

// Color mapping for all node types
const NODE_COLORS: Record<string, string> = {
  session: 'bg-blue-500',
  error: 'bg-red-500',
  agent: 'bg-emerald-500',
  tool: 'bg-purple-500',
  model: 'bg-yellow-500',
  skill: 'bg-cyan-500',
  pattern: 'bg-pink-500',
  concept: 'bg-orange-500',
  solution: 'bg-green-500',
  template: 'bg-indigo-500',
  profile: 'bg-teal-500',
  rule: 'bg-amber-500',
};

export function KnowledgeGraphViewer() {
  const [data, setData] = useState<KnowledgeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'taxonomy' | 'types' | 'edges' | 'graph'>('types');

  const fetchData = useCallback(async () => {
    try {
      // Fetch from multiple sources
      const [graphRes, taxonomyRes] = await Promise.all([
        fetch('/api/memory-graph'),
        fetch('/api/learning')
      ]);
      
      const graphData = await graphRes.json();
      const learningData = await taxonomyRes.json();
      
      // Build comprehensive knowledge data from enhanced API
      const nodeTypeCounts: Record<string, number> = {};
      const edgeTypeCounts: Record<string, number> = {};
      
      // Count nodes by type
      if (graphData.nodes) {
        for (const node of graphData.nodes) {
          nodeTypeCounts[node.type] = (nodeTypeCounts[node.type] || 0) + 1;
        }
      }
      
      // Count edges by type
      if (graphData.edges) {
        for (const edge of graphData.edges) {
          edgeTypeCounts[edge.type] = (edgeTypeCounts[edge.type] || 0) + edge.weight;
        }
      }
      
      const knowledgeData: KnowledgeData = {
        nodes: graphData.nodes || [],
        edges: graphData.edges || [],
        taxonomy: buildTaxonomyFromPatterns(learningData),
        nodeTypes: nodeTypeCounts,
        edgeTypes: edgeTypeCounts,
        stats: {
          totalNodes: graphData.meta?.totalNodes || graphData.nodes?.length || 0,
          totalEdges: graphData.meta?.totalEdges || graphData.edges?.length || 0,
          sessions: nodeTypeCounts.session || 0,
          errors: nodeTypeCounts.error || 0,
          agents: nodeTypeCounts.agent || 0,
          tools: nodeTypeCounts.tool || 0,
          models: nodeTypeCounts.model || 0,
          skills: nodeTypeCounts.skill || 0,
          patterns: nodeTypeCounts.pattern || 0,
          concepts: nodeTypeCounts.concept || 0,
          solutions: nodeTypeCounts.solution || 0,
          templates: nodeTypeCounts.template || 0,
          profiles: nodeTypeCounts.profile || 0,
          rules: nodeTypeCounts.rule || 0,
        }
      };
      
      setData(knowledgeData);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchData]);

  const renderTaxonomyNode = (node: TaxonomyNode, level = 0): React.ReactNode => {
    const hasChildren = node.children && node.children.length > 0;
    return (
      <div key={node.name} className={`ml-${level * 4}`}>
        <div 
          className="flex items-center gap-2 py-1 px-2 hover:bg-zinc-800 rounded cursor-pointer"
          onClick={() => setSelectedNode(selectedNode === node.name ? null : node.name)}
        >
          <span className="text-zinc-400">{hasChildren ? '📁' : '📄'}</span>
          <span className="text-zinc-300 text-sm">{node.name}</span>
          {node.count !== undefined && (
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
              {node.count}
            </span>
          )}
        </div>
        {hasChildren && selectedNode === node.name && (
          <div className="ml-4 border-l border-zinc-700">
            {node.children!.map(child => renderTaxonomyNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
        <p className="text-red-400">Error: {error}</p>
        <button onClick={fetchData} className="mt-2 px-3 py-1 bg-red-600 rounded text-sm">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-zinc-800 p-4 rounded-lg">
          <div className="text-2xl font-bold text-emerald-400">{data?.stats?.totalNodes || 0}</div>
          <div className="text-sm text-zinc-400">Total Nodes</div>
        </div>
        <div className="bg-zinc-800 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-400">{data?.stats?.totalEdges || 0}</div>
          <div className="text-sm text-zinc-400">Total Edges</div>
        </div>
        <div className="bg-zinc-800 p-4 rounded-lg">
          <div className="text-2xl font-bold text-purple-400">{data?.stats?.sessions || 0}</div>
          <div className="text-sm text-zinc-400">Sessions</div>
        </div>
        <div className="bg-zinc-800 p-4 rounded-lg">
          <div className="text-2xl font-bold text-red-400">{data?.stats?.errors || 0}</div>
          <div className="text-sm text-zinc-400">Errors</div>
        </div>
        <div className="bg-zinc-800 p-4 rounded-lg">
          <div className="text-2xl font-bold text-cyan-400">{data?.stats?.skills || 0}</div>
          <div className="text-sm text-zinc-400">Skills</div>
        </div>
        <div className="bg-zinc-800 p-4 rounded-lg">
          <div className="text-2xl font-bold text-pink-400">{data?.stats?.patterns || 0}</div>
          <div className="text-sm text-zinc-400">Patterns</div>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex gap-2 flex-wrap">
        {(['taxonomy', 'types', 'edges', 'graph'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              viewMode === mode 
                ? 'bg-emerald-600 text-white' 
                : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            {mode === 'taxonomy' && '🔍 Taxonomy'}
            {mode === 'types' && '🔷 Node Types'}
            {mode === 'edges' && '🔗 Edge Types'}
            {mode === 'graph' && '🕸️ Graph Preview'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="grid md:grid-cols-2 gap-6">
        {viewMode === 'taxonomy' && (
          <div className="bg-zinc-800 p-4 rounded-lg max-h-96 overflow-auto">
            <h3 className="text-lg font-medium text-zinc-200 mb-4">Error Taxonomy</h3>
            {data?.taxonomy && renderTaxonomyNode(data.taxonomy)}
          </div>
        )}

        {viewMode === 'types' && (
          <div className="bg-zinc-800 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-zinc-200 mb-4">Node Types</h3>
            <div className="space-y-3">
              {Object.entries(data?.nodeTypes || {}).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${NODE_COLORS[type] || 'bg-gray-500'}`} />
                    <span className="text-zinc-300 capitalize">{type}</span>
                  </div>
                  <span className="text-zinc-400 font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {viewMode === 'graph' && (
          <div className="bg-zinc-800 rounded-lg overflow-hidden h-[600px]">
            <Suspense fallback={
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
              </div>
            }>
              <InteractiveKnowledgeGraph
                nodes={data?.nodes || []}
                edges={data?.edges || []}
                onNodeSelect={setSelectedNode}
                selectedNode={selectedNode}
              />
            </Suspense>
          </div>
        )}

        {viewMode === 'edges' && (
          <div className="bg-zinc-800 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-zinc-200 mb-4">Edge Types</h3>
            <div className="space-y-3">
              {Object.entries(data?.edgeTypes || {}).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">⟶</span>
                    <span className="text-zinc-300">{type}</span>
                  </div>
                  <span className="text-zinc-400 font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Knowledge Summary */}
        <div className="bg-zinc-800 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-zinc-200 mb-4">🧠 Knowledge Graph Architecture</h3>
          <div className="space-y-2 text-sm text-zinc-400">
            <p className="text-zinc-300 font-medium">Data Sources (reads from ~/.opencode/):</p>
            <p>• <span className="text-blue-400">messages/</span> - Sessions, agents, tools, models, errors</p>
            <p>• <span className="text-pink-400">learning/</span> - Anti-patterns & positive patterns</p>
            <p>• <span className="text-cyan-400">skills/</span> - Skill bank with success rates</p>
            <p>• <span className="text-indigo-400">templates/</span> - Reusable templates</p>
            <p>• <span className="text-teal-400">profiles/</span> - User profiles</p>
            <p>• <span className="text-amber-400">global-rules/</span> - System rules</p>
            <p>• <span className="text-orange-400">parts/</span> - Component library</p>
            <p className="text-zinc-300 font-medium mt-2">Node Types (13):</p>
            <p>session, error, agent, tool, model, skill, pattern, concept, solution, template, profile, rule</p>
            <p className="text-zinc-300 font-medium mt-2">Edge Types (10):</p>
            <p>uses_agent, uses_tool, has_error, uses_skill, solves_with, follows_pattern, delegates_to, learns_from, uses_template, has_profile, matches_rule</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildTaxonomyFromPatterns(learningData: any): TaxonomyNode {
  // Build taxonomy from anti-patterns
  const root: TaxonomyNode = {
    name: 'errors',
    children: []
  };
  
  const categories: Record<string, TaxonomyNode[]> = {
    runtime_error: [],
    syntax_error: [],
    io_error: [],
    module_error: [],
    logic_error: [],
  };
  
  // Add anti-patterns as leaf nodes
  if (learningData?.anti_patterns?.items) {
    learningData.anti_patterns.items.forEach((pattern: any) => {
      const node: TaxonomyNode = {
        name: pattern.type,
        count: pattern.count
      };
      
      // Categorize by pattern type
      if (pattern.type.includes('debug') || pattern.type.includes('state')) {
        categories.logic_error.push(node);
      } else if (pattern.type.includes('type')) {
        categories.syntax_error.push(node);
      } else if (pattern.type.includes('tool') || pattern.type.includes('solution')) {
        categories.runtime_error.push(node);
      } else {
        categories.module_error.push(node);
      }
    });
  }
  
  // Build tree
  Object.entries(categories).forEach(([category, nodes]) => {
    if (nodes.length > 0) {
      root.children!.push({
        name: category.replace('_', ' '),
        children: nodes
      });
    }
  });
  
  return root;
}
