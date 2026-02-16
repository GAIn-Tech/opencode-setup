'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface GraphNode {
  id: string;
  type: string;
  count: number;
  x?: number;
  y?: number;
}

interface GraphEdge {
  from: string;
  to: string;
  weight: number;
  type?: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: { sessions?: number; agents?: number; tools?: number; errors?: number; nodeTypes?: Record<string, number>; message?: string };
}

const NODE_COLORS: Record<string, string> = {
  session: '#3b82f6',
  agent: '#10b981',
  tool: '#8b5cf6',
  model: '#eab308',
  skill: '#22d3ee',
  solution: '#22c55e',
  pattern: '#ec4899',
  concept: '#f97316',
  template: '#6366f1',
  profile: '#14b8a6',
  rule: '#f59e0b',
  error: '#ef4444'
};

export function MemoryGraphViewer() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/memory-graph');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      
      // Layout nodes in columns by type
      const nodes = json.nodes as GraphNode[];
      const typeOrder = ['session', 'agent', 'tool', 'model', 'skill', 'solution', 'pattern', 'concept', 'template', 'profile', 'rule', 'error'];
      const types = Array.from(new Set(nodes.map((n) => n.type)));
      const sortedTypes = [
        ...typeOrder.filter((t) => types.includes(t)),
        ...types.filter((t) => !typeOrder.includes(t))
      ];

      const colWidth = 160;
      const startY = 80;
      const rowHeight = 40;

      sortedTypes.forEach((type, colIndex) => {
        const typeNodes = nodes.filter((n) => n.type === type);
        typeNodes.forEach((node, rowIndex) => {
          node.x = colWidth * colIndex;
          node.y = startY + rowIndex * rowHeight;
        });
      });
      
      setData(json);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 5 seconds for live data
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getConnectedEdges = (nodeId: string) => {
    if (!data) return [];
    return data.edges.filter(e => e.from === nodeId || e.to === nodeId);
  };

  const isHighlighted = (nodeId: string) => {
    if (!selectedNode) return true;
    if (nodeId === selectedNode) return true;
    return getConnectedEdges(selectedNode).some(e => e.from === nodeId || e.to === nodeId);
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
        <p className="text-red-400">Error loading memory graph: {error}</p>
        <button onClick={fetchData} className="mt-2 px-3 py-1 bg-red-600 rounded text-sm">
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="text-4xl mb-4">🧠</div>
        <h3 className="text-lg font-medium text-zinc-300">No Memory Graph Data</h3>
        <p className="text-zinc-500 mt-2">
          Session logs will appear here as you work. The graph shows relationships between sessions and errors.
        </p>
      </div>
    );
  }

  const width = 600;
  const height = Math.max(400, data.nodes.length * 40);
  const legendTypes = Object.entries(data.meta.nodeTypes || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setZoom(z => Math.min(2, z + 0.1))}
          className="px-3 py-1 bg-zinc-700 rounded hover:bg-zinc-600"
        >
          Zoom +
        </button>
        <button
          onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
          className="px-3 py-1 bg-zinc-700 rounded hover:bg-zinc-600"
        >
          Zoom -
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setSelectedNode(null); }}
          className="px-3 py-1 bg-zinc-700 rounded hover:bg-zinc-600"
        >
          Reset
        </button>
        <span className="text-zinc-400 text-sm">
          {Object.entries(data.meta.nodeTypes || {})
            .slice(0, 4)
            .map(([type, count]) => `${count} ${type}`)
            .join(', ')}
        </span>
      </div>

      {/* Graph */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden">
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          viewBox={`${-pan.x} ${-pan.y} ${width / zoom} ${height / zoom}`}
          className="cursor-grab"
        >
          {/* Edges */}
          {data.edges.map((edge, i) => {
            const fromNode = data.nodes.find(n => n.id === edge.from);
            const toNode = data.nodes.find(n => n.id === edge.to);
            if (!fromNode?.x || !toNode?.x) return null;
            
            const opacity = isHighlighted(edge.from) && isHighlighted(edge.to) ? 0.6 : 0.1;
            const edgeColor = edge.type === 'uses_skill' ? '#22d3ee'
              : edge.type === 'uses_model' ? '#eab308'
              : edge.type === 'follows_pattern' ? '#ec4899'
              : '#10b981';
            
            return (
              <line
                key={i}
                x1={fromNode.x + 20}
                y1={fromNode.y || 0}
                x2={toNode.x - 20}
                y2={toNode.y || 0}
                stroke={edgeColor}
                strokeWidth={Math.min(edge.weight, 5)}
                opacity={opacity}
              />
            );
          })}

          {/* Nodes */}
          {data.nodes.map((node) => {
            const isSession = node.type === 'session';
            const isAgent = node.type === 'agent';
            const isTool = node.type === 'tool';
            const isError = node.type === 'error';
            
            // Color by type
            const nodeColor = NODE_COLORS[node.type] || '#a1a1aa';
            
            const radius = Math.min(18, 6 + node.count * 2);
            const opacity = isHighlighted(node.id) ? 1 : 0.3;
            
            // Position label based on column
            const labelX = isSession || isAgent ? -radius - 5 : radius + 5;
            const textAnchor = isSession || isAgent ? 'end' : 'start';
            
            return (
              <g
                key={node.id}
                transform={`translate(${node.x || 0}, ${node.y || 0})`}
                onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                className="cursor-pointer"
                opacity={opacity}
              >
                <circle
                  r={radius}
                  fill={nodeColor}
                  stroke={selectedNode === node.id ? '#fff' : 'transparent'}
                  strokeWidth={2}
                />
                <text
                  x={labelX}
                  y={4}
                  textAnchor={textAnchor}
                  fill="#d4d4d8"
                  fontSize="10"
                >
                  {node.id.slice(0, 18)}{node.id.length > 18 ? '...' : ''}
                </text>
                <title>
                  {node.type}: {node.id}
                  {'\n'}Count: {node.count}
                </title>
              </g>
            );
          })}

          {/* Legend */}
          <g transform="translate(10, 20)">
            {legendTypes.map(([type], index) => (
              <g key={type} transform={`translate(${index * 90}, 0)`}>
                <circle cx={0} cy={0} r={6} fill={NODE_COLORS[type] || '#a1a1aa'} />
                <text x={12} y={4} fill="#a1a1aa" fontSize="10">
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* Selected Node Info */}
      {selectedNode && (
        <div className="p-4 bg-zinc-800 rounded-lg">
          <h4 className="font-medium">Selected: {selectedNode}</h4>
          <p className="text-sm text-zinc-400 mt-1">
            Connected to {getConnectedEdges(selectedNode).length} other nodes
          </p>
        </div>
      )}
    </div>
  );
}
