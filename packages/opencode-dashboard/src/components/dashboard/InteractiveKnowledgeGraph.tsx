'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addEdge,
  Background,
  Connection,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type OnMove,
  type Viewport,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const KNOWN_TYPES = [
  'session',
  'error',
  'HIT_ERROR',
  'agent',
  'tool',
  'model',
  'skill',
  'pattern',
  'concept',
  'solution',
  'template',
  'profile',
  'rule',
  'file',
] as const;
type UnifiedNodeType = (typeof KNOWN_TYPES)[number];

type UnifiedNodeData = {
  label: string;
  severity?: string;
  frequency?: number;
  pattern_type?: string;
  task_context?: string;
  timestamp?: string;
  source_id?: string;
  [key: string]: unknown;
};

type UnifiedFlowNode = Node<UnifiedNodeData, UnifiedNodeType>;
type UnifiedFlowEdge = Edge<{ label?: string; strength?: number }>;

type LODTier = 0 | 1 | 2;
type GroupKey = 'runtime' | 'capabilities' | 'knowledge' | 'issues' | 'other';

const VIEWPORT_STORAGE_KEY = 'opencode-dashboard:kg-viewport:v1';

interface InputNode {
  id: string;
  type?: string;
  label?: string;
  count?: number;
  data?: Record<string, unknown>;
}

interface InputEdge {
  id?: string;
  from?: string;
  to?: string;
  source?: string;
  target?: string;
  type?: string;
  weight?: number;
  data?: Record<string, unknown>;
}

interface InteractiveKnowledgeGraphProps {
  nodes?: InputNode[];
  edges?: InputEdge[];
  onNodeSelect?: (nodeId: string | null) => void;
  selectedNode?: string | null;
}

const TYPE_LABEL: Record<UnifiedNodeType, string> = {
  session: 'Session',
  error: 'Error',
  HIT_ERROR: 'HIT Error',
  agent: 'Agent',
  pattern: 'Pattern',
  tool: 'Tool',
  model: 'Model',
  skill: 'Skill',
  concept: 'Concept',
  solution: 'Solution',
  template: 'Template',
  profile: 'Profile',
  rule: 'Rule',
  file: 'File',
};

const TYPE_COLORS: Record<UnifiedNodeType, string> = {
  session: '#3b82f6',
  error: '#ef4444',
  HIT_ERROR: '#a855f7',
  agent: '#8b5cf6',
  pattern: '#10b981',
  tool: '#06b6d4',
  model: '#0ea5e9',
  skill: '#14b8a6',
  concept: '#22c55e',
  solution: '#84cc16',
  template: '#f59e0b',
  profile: '#f97316',
  rule: '#eab308',
  file: '#f59e0b',
};

const GROUP_LABELS: Record<GroupKey, string> = {
  runtime: 'Runtime',
  capabilities: 'Capabilities',
  knowledge: 'Knowledge',
  issues: 'Issues',
  other: 'Other',
};

const GROUP_COLORS: Record<GroupKey, string> = {
  runtime: '#3b82f6',
  capabilities: '#06b6d4',
  knowledge: '#22c55e',
  issues: '#ef4444',
  other: '#a1a1aa',
};

const TYPE_TO_GROUP: Record<UnifiedNodeType, GroupKey> = {
  session: 'runtime',
  agent: 'runtime',
  model: 'runtime',
  tool: 'capabilities',
  skill: 'capabilities',
  template: 'capabilities',
  pattern: 'knowledge',
  concept: 'knowledge',
  solution: 'knowledge',
  rule: 'knowledge',
  error: 'issues',
  HIT_ERROR: 'issues',
  profile: 'issues',
  file: 'other',
};

const GROUP_NODE_TYPE: Record<GroupKey, UnifiedNodeType> = {
  runtime: 'session',
  capabilities: 'tool',
  knowledge: 'concept',
  issues: 'error',
  other: 'file',
};

const GROUP_POSITIONS: Record<GroupKey, { x: number; y: number }> = {
  runtime: { x: 240, y: 210 },
  capabilities: { x: 940, y: 210 },
  knowledge: { x: 240, y: 560 },
  issues: { x: 940, y: 560 },
  other: { x: 590, y: 760 },
};

function normalizeType(rawType: string | undefined, sourceId: string, data?: Record<string, unknown>): UnifiedNodeType {
  const value = (rawType ?? '').trim();
  const lowerType = value.toLowerCase();
  const lowerId = sourceId.toLowerCase();
  const severity = typeof data?.severity === 'string' ? data.severity.toLowerCase() : '';

  if (value === 'HIT_ERROR' || lowerType === 'hit_error' || lowerType === 'hit-error') return 'HIT_ERROR';
  if (lowerType === 'session') return 'session';
  if (lowerType === 'agent') return 'agent';
  if (lowerType === 'error' || lowerType.includes('exception') || severity === 'critical') return 'error';
  if (lowerType === 'tool') return 'tool';
  if (lowerType === 'model') return 'model';
  if (lowerType === 'skill') return 'skill';
  if (lowerType === 'pattern') return 'pattern';
  if (lowerType === 'concept') return 'concept';
  if (lowerType === 'solution') return 'solution';
  if (lowerType === 'template') return 'template';
  if (lowerType === 'profile') return 'profile';
  if (lowerType === 'rule') return 'rule';
  if (lowerType === 'file') return 'file';

  if (lowerId.includes('hit_error') || lowerId.includes('hit-error')) return 'HIT_ERROR';
  if (lowerId.includes('error') || lowerId.includes('exception') || lowerId.includes('timeout')) return 'error';
  if (/[\\/]/.test(sourceId) || /\.[a-z0-9]{1,8}$/i.test(sourceId)) return 'file';

  return 'concept';
}

function isUnifiedNodeType(value: string): value is UnifiedNodeType {
  return (KNOWN_TYPES as readonly string[]).includes(value);
}

function stripPrefix(id: string): string {
  const value = id.trim();
  const index = value.indexOf(':');
  if (index > 0) {
    const maybeType = value.slice(0, index).toLowerCase();
    if (KNOWN_TYPES.map((item) => item.toLowerCase()).includes(maybeType)) {
      return value.slice(index + 1);
    }
  }
  return value;
}

function toUnifiedId(type: UnifiedNodeType, sourceId: string): string {
  return `${type}:${stripPrefix(sourceId)}`;
}

function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash);
}

function positionForNode(type: UnifiedNodeType, id: string): { x: number; y: number } {
  const center = {
    session: { x: 180, y: 160 },
    error: { x: 620, y: 160 },
    HIT_ERROR: { x: 940, y: 240 },
    agent: { x: 360, y: 160 },
    tool: { x: 820, y: 160 },
    model: { x: 1060, y: 160 },
    skill: { x: 180, y: 420 },
    pattern: { x: 380, y: 420 },
    concept: { x: 580, y: 420 },
    solution: { x: 780, y: 420 },
    template: { x: 980, y: 420 },
    profile: { x: 1180, y: 420 },
    rule: { x: 380, y: 650 },
    file: { x: 780, y: 650 },
  }[type];

  const seed = seedFromString(id);
  const angle = (seed % 360) * (Math.PI / 180);
  const radius = 30 + (seed % 110);

  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  };
}

function edgeColorForLabel(label: string | undefined): string {
  if (!label) return '#3f3f46';
  const lower = label.toLowerCase();
  if (lower.includes('error')) return '#b91c1c';
  if (lower.includes('pattern')) return '#047857';
  if (lower.includes('tool')) return '#0891b2';
  return '#52525b';
}

function applyEdgeControls<T extends { data?: { strength?: number } }>(
  input: T[],
  minStrength: number,
  topK: number
): T[] {
  const withStrength = input.filter((item) => {
    const strength = typeof item.data?.strength === 'number' ? item.data.strength : 1;
    return strength >= minStrength;
  });

  if (topK <= 0 || withStrength.length <= topK) {
    return withStrength;
  }

  return [...withStrength]
    .sort((a, b) => {
      const aStrength = typeof a.data?.strength === 'number' ? a.data.strength : 1;
      const bStrength = typeof b.data?.strength === 'number' ? b.data.strength : 1;
      return bStrength - aStrength;
    })
    .slice(0, topK);
}

function nodeColor(nodeType: UnifiedNodeType, severity?: string): string {
  if (nodeType === 'error' && severity) {
    const lower = severity.toLowerCase();
    if (lower === 'critical' || lower === 'high') return '#ef4444';
    if (lower === 'warning' || lower === 'medium') return '#f59e0b';
    if (lower === 'low' || lower === 'info') return '#eab308';
  }
  return TYPE_COLORS[nodeType];
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function GraphNodeCard({ id, type, data }: NodeProps<UnifiedFlowNode>) {
  const color = nodeColor(type, typeof data.severity === 'string' ? data.severity : undefined);

  return (
    <div
      className="min-w-[168px] rounded-xl border bg-zinc-900/95 px-3 py-2 shadow-[0_10px_35px_rgba(0,0,0,0.35)]"
      style={{ borderColor: `${color}cc`, boxShadow: `0 12px 28px ${color}33` }}
    >
      <Handle type="target" position={Position.Left} style={{ background: color, width: 8, height: 8 }} />
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="max-w-[150px] truncate text-sm font-semibold text-zinc-100">{data.label}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-zinc-400">
        <span>{TYPE_LABEL[type]}</span>
        <span className="font-mono text-zinc-500">{id.split(':')[1] ?? id}</span>
      </div>
      {data.frequency !== undefined ? (
        <div className="mt-1 text-[11px] text-zinc-500">freq {String(data.frequency)}</div>
      ) : null}
      <Handle type="source" position={Position.Right} style={{ background: color, width: 8, height: 8 }} />
    </div>
  );
}

const nodeTypes = {
  session: GraphNodeCard,
  error: GraphNodeCard,
  HIT_ERROR: GraphNodeCard,
  agent: GraphNodeCard,
  pattern: GraphNodeCard,
  tool: GraphNodeCard,
  model: GraphNodeCard,
  skill: GraphNodeCard,
  concept: GraphNodeCard,
  solution: GraphNodeCard,
  template: GraphNodeCard,
  profile: GraphNodeCard,
  rule: GraphNodeCard,
  file: GraphNodeCard,
} as const;

function computeNeighborhood(
  focusNodeId: string | null,
  depth: 1 | 2,
  edges: UnifiedFlowEdge[]
): Set<string> | null {
  if (!focusNodeId) return null;

  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const visited = new Set<string>([focusNodeId]);
  let frontier = new Set<string>([focusNodeId]);

  for (let d = 0; d < depth; d += 1) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.add(neighbor);
        }
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }

  return visited;
}

function normalizeGraph(rawNodes: InputNode[], rawEdges: InputEdge[]): { nodes: UnifiedFlowNode[]; edges: UnifiedFlowEdge[] } {
  const aliasMap = new Map<string, string[]>();
  const nodes: UnifiedFlowNode[] = [];

  for (const rawNode of rawNodes) {
    const sourceId = String(rawNode.id ?? '').trim();
    if (!sourceId) continue;

    const normalizedType = normalizeType(rawNode.type, sourceId, rawNode.data);
    const unifiedId = toUnifiedId(normalizedType, sourceId);
    const frequency = typeof rawNode.count === 'number' ? rawNode.count : undefined;

    const metadata: UnifiedNodeData = {
      label: rawNode.label ?? stripPrefix(sourceId),
      frequency,
      source_id: sourceId,
      ...(rawNode.data ?? {}),
    };

    if (!metadata.timestamp && typeof rawNode.data?.last_seen === 'string') {
      metadata.timestamp = rawNode.data.last_seen;
    }

    const node: UnifiedFlowNode = {
      id: unifiedId,
      type: normalizedType,
      position: positionForNode(normalizedType, unifiedId),
      data: metadata,
      style: { borderRadius: 12 },
      draggable: true,
      selectable: true,
    };

    nodes.push(node);

    const aliases = [
      sourceId,
      stripPrefix(sourceId),
      unifiedId,
      `${normalizedType}:${stripPrefix(sourceId)}`,
      rawNode.type ? `${rawNode.type}:${stripPrefix(sourceId)}` : '',
    ].filter(Boolean);

    for (const alias of aliases) {
      const existing = aliasMap.get(alias) ?? [];
      if (!existing.includes(unifiedId)) existing.push(unifiedId);
      aliasMap.set(alias, existing);
    }
  }

  const firstForAlias = (value: string): string | null => {
    const direct = aliasMap.get(value);
    if (direct && direct.length > 0) return direct[0];
    const stripped = stripPrefix(value);
    const strippedMatch = aliasMap.get(stripped);
    if (strippedMatch && strippedMatch.length > 0) return strippedMatch[0];
    return null;
  };

  const edges: UnifiedFlowEdge[] = rawEdges
    .map((edge, index) => {
      const sourceRaw = String(edge.source ?? edge.from ?? '').trim();
      const targetRaw = String(edge.target ?? edge.to ?? '').trim();

      if (!sourceRaw || !targetRaw) return null;

      const source = firstForAlias(sourceRaw);
      const target = firstForAlias(targetRaw);
      if (!source || !target) return null;

      const strength =
        typeof edge.weight === 'number'
          ? edge.weight
          : typeof edge.data?.strength === 'number'
            ? (edge.data.strength as number)
            : 1;

      const label = edge.type ?? (typeof edge.data?.label === 'string' ? edge.data.label : undefined);
      const strokeWidth = Math.max(1, Math.min(6, 1 + strength));
      const edgeId = edge.id ?? `edge:${source}->${target}:${label ?? index}`;

      return {
        id: edgeId,
        source,
        target,
        type: 'smoothstep',
        data: { label, strength },
        label,
        animated: strength > 2,
        style: { stroke: edgeColorForLabel(label), strokeWidth, opacity: 0.85 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: edgeColorForLabel(label) },
      } as UnifiedFlowEdge;
    })
    .filter((edge): edge is UnifiedFlowEdge => edge !== null);

  return { nodes, edges };
}

function preserveNodePositions(nextNodes: UnifiedFlowNode[], previousNodes: UnifiedFlowNode[]): UnifiedFlowNode[] {
  if (previousNodes.length === 0) return nextNodes;

  const byId = new Map(previousNodes.map((node) => [node.id, node.position]));
  return nextNodes.map((node) => {
    const previousPosition = byId.get(node.id);
    if (!previousPosition) return node;
    return { ...node, position: previousPosition };
  });
}

function loadSavedViewport(): Viewport | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(VIEWPORT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<Viewport>;
    if (
      typeof parsed.x === 'number' && Number.isFinite(parsed.x) &&
      typeof parsed.y === 'number' && Number.isFinite(parsed.y) &&
      typeof parsed.zoom === 'number' && Number.isFinite(parsed.zoom)
    ) {
      return { x: parsed.x, y: parsed.y, zoom: parsed.zoom };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function saveViewport(viewport: Viewport): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(viewport));
  } catch {
    // no-op: storage failures should not affect graph interaction
  }
}

export function InteractiveKnowledgeGraph({ nodes: externalNodes, edges: externalEdges, onNodeSelect, selectedNode }: InteractiveKnowledgeGraphProps) {
  const [loading, setLoading] = useState(!externalNodes);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<UnifiedFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<UnifiedFlowEdge>([]);
  const [activeTypes, setActiveTypes] = useState<Record<UnifiedNodeType, boolean>>({
    session: true,
    error: true,
    HIT_ERROR: true,
    agent: true,
    pattern: true,
    tool: true,
    model: true,
    skill: true,
    concept: true,
    solution: true,
    template: true,
    profile: true,
    rule: true,
    file: true,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [focusDepth, setFocusDepth] = useState<1 | 2>(1);
  const [selectedFlowNode, setSelectedFlowNode] = useState<UnifiedFlowNode | null>(null);
  const [defaultViewport, setDefaultViewport] = useState<Viewport | undefined>(() => loadSavedViewport());
  const [viewportZoom, setViewportZoom] = useState<number>(defaultViewport?.zoom ?? 1);
  const [tierOverride, setTierOverride] = useState<LODTier | null>(null);
  const [focusGroup, setFocusGroup] = useState<GroupKey | null>(null);
  const [focusType, setFocusType] = useState<UnifiedNodeType | null>(null);
  const [minEdgeStrength, setMinEdgeStrength] = useState<number>(1);
  const [maxVisibleEdges, setMaxVisibleEdges] = useState<number>(300);
  const [autoEdgeControls, setAutoEdgeControls] = useState<boolean>(true);

  const fetchData = useCallback(async () => {
    if (externalNodes && externalEdges) {
      const normalized = normalizeGraph(externalNodes, externalEdges);
      setNodes((prev) => preserveNodePositions(normalized.nodes, prev));
      setEdges(normalized.edges);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/memory-graph?sinceDays=7&maxFanout=15');
      if (!response.ok) {
        throw new Error(`Failed to load graph (${response.status})`);
      }

      const payload = (await response.json()) as { nodes?: InputNode[]; edges?: InputEdge[] };
      const normalized = normalizeGraph(payload.nodes ?? [], payload.edges ?? []);

      setNodes((prev) => preserveNodePositions(normalized.nodes, prev));
      setEdges(normalized.edges);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  }, [externalEdges, externalNodes, setEdges, setNodes]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (externalNodes && externalEdges) return;

    const timer = setInterval(() => {
      void fetchData();
    }, 15000);

    return () => clearInterval(timer);
  }, [externalEdges, externalNodes, fetchData]);

  useEffect(() => {
    if (!selectedNode) return;
    const found = nodes.find((node) => node.id === selectedNode || node.id.endsWith(`:${selectedNode}`));
    if (found) {
      setSelectedFlowNode(found);
      setFocusNodeId(found.id);
    }
  }, [nodes, selectedNode]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const neighborhood = useMemo(() => computeNeighborhood(focusNodeId, focusDepth, edges), [edges, focusDepth, focusNodeId]);

  const visibleInstanceNodes = useMemo(() => {
    return nodes.filter((node) => {
      const typeVisible = activeTypes[node.type as UnifiedNodeType] ?? false;
      if (!typeVisible && node.id !== focusNodeId) return false;

      if (focusGroup && TYPE_TO_GROUP[node.type as UnifiedNodeType] !== focusGroup) return false;
      if (focusType && node.type !== focusType) return false;

      if (neighborhood && !neighborhood.has(node.id)) return false;

      if (!normalizedSearch) return true;
      const haystack = `${node.id} ${node.data.label} ${node.data.pattern_type ?? ''} ${node.data.task_context ?? ''}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [activeTypes, focusNodeId, neighborhood, nodes, normalizedSearch]);

  const visibleNodeIds = useMemo(() => new Set(visibleInstanceNodes.map((node) => node.id)), [visibleInstanceNodes]);

  const visibleInstanceEdges = useMemo(() => {
    return edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
  }, [edges, visibleNodeIds]);

  const filteredInstanceEdges = useMemo(() => {
    return applyEdgeControls(visibleInstanceEdges, minEdgeStrength, maxVisibleEdges);
  }, [maxVisibleEdges, minEdgeStrength, visibleInstanceEdges]);

  const effectiveTier = useMemo<LODTier>(() => {
    if (tierOverride !== null) return tierOverride;
    if (viewportZoom < 0.45) return 0;
    if (viewportZoom < 0.85 || visibleInstanceNodes.length > 180) return 1;
    return 2;
  }, [tierOverride, viewportZoom, visibleInstanceNodes.length]);

  useEffect(() => {
    if (!autoEdgeControls) return;

    let nextMinStrength = 1;
    let nextMaxEdges = 400;

    if (viewportZoom < 0.35) {
      nextMinStrength = 4;
      nextMaxEdges = 120;
    } else if (viewportZoom < 0.55) {
      nextMinStrength = 3;
      nextMaxEdges = 180;
    } else if (viewportZoom < 0.85) {
      nextMinStrength = 2;
      nextMaxEdges = 260;
    }

    if (effectiveTier === 0) {
      nextMinStrength = Math.max(nextMinStrength, 3);
      nextMaxEdges = Math.min(nextMaxEdges, 180);
    } else if (effectiveTier === 1) {
      nextMinStrength = Math.max(nextMinStrength, 2);
      nextMaxEdges = Math.min(nextMaxEdges, 240);
    }

    setMinEdgeStrength(nextMinStrength);
    setMaxVisibleEdges(nextMaxEdges);
  }, [autoEdgeControls, effectiveTier, viewportZoom]);

  const visibleGraph = useMemo<{ nodes: UnifiedFlowNode[]; edges: UnifiedFlowEdge[] }>(() => {
    if (effectiveTier === 2) {
      return { nodes: visibleInstanceNodes, edges: filteredInstanceEdges };
    }

    const nodeById = new Map(visibleInstanceNodes.map((node) => [node.id, node]));

    if (effectiveTier === 1) {
      const typeNodes: UnifiedFlowNode[] = [];
      for (const type of KNOWN_TYPES) {
        if (!activeTypes[type]) continue;
        if (focusGroup && TYPE_TO_GROUP[type] !== focusGroup) continue;

        const count = visibleInstanceNodes.filter((node) => node.type === type).length;
        if (count === 0) continue;

        typeNodes.push({
          id: `meta-type:${type}`,
          type,
          position: positionForNode(type, `meta-type:${type}`),
          data: {
            label: `${TYPE_LABEL[type]} (${count})`,
            frequency: count,
            source_id: `meta-type:${type}`,
            task_context: 'hierarchy-type-node',
          },
          style: { borderRadius: 12 },
          draggable: true,
          selectable: true,
        });
      }

      const typeEdgeMap = new Map<string, { from: UnifiedNodeType; to: UnifiedNodeType; weight: number }>();
      for (const edge of filteredInstanceEdges) {
        const sourceNode = nodeById.get(edge.source);
        const targetNode = nodeById.get(edge.target);
        if (!sourceNode || !targetNode) continue;

        const fromType = sourceNode.type as UnifiedNodeType;
        const toType = targetNode.type as UnifiedNodeType;
        if (focusGroup && (TYPE_TO_GROUP[fromType] !== focusGroup || TYPE_TO_GROUP[toType] !== focusGroup)) continue;

        const key = `${fromType}->${toType}`;
        const existing = typeEdgeMap.get(key);
        const strength = typeof edge.data?.strength === 'number' ? edge.data.strength : 1;
        if (existing) {
          existing.weight += strength;
        } else {
          typeEdgeMap.set(key, { from: fromType, to: toType, weight: strength });
        }
      }

      const typeEdges: UnifiedFlowEdge[] = applyEdgeControls(
        Array.from(typeEdgeMap.values()).map((item, index) => ({
        id: `meta-type-edge:${item.from}->${item.to}:${index}`,
        source: `meta-type:${item.from}`,
        target: `meta-type:${item.to}`,
        type: 'smoothstep',
        data: { label: `${TYPE_LABEL[item.from]} -> ${TYPE_LABEL[item.to]}`, strength: item.weight },
        label: `${item.weight}`,
        animated: item.weight > 3,
        style: {
          stroke: edgeColorForLabel(`${item.from}->${item.to}`),
          strokeWidth: Math.max(1, Math.min(6, 1 + item.weight / 2)),
          opacity: 0.8,
        },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#52525b' },
      })),
        minEdgeStrength,
        maxVisibleEdges
      );

      return { nodes: typeNodes, edges: typeEdges };
    }

    const groupNodes: UnifiedFlowNode[] = [];
    for (const group of Object.keys(GROUP_LABELS) as GroupKey[]) {
      const count = visibleInstanceNodes.filter((node) => TYPE_TO_GROUP[node.type as UnifiedNodeType] === group).length;
      if (count === 0) continue;

      groupNodes.push({
        id: `meta-group:${group}`,
        type: GROUP_NODE_TYPE[group],
        position: GROUP_POSITIONS[group],
        data: {
          label: `${GROUP_LABELS[group]} (${count})`,
          frequency: count,
          source_id: `meta-group:${group}`,
          task_context: 'hierarchy-group-node',
        },
        style: {
          borderRadius: 14,
          boxShadow: `0 0 0 1px ${GROUP_COLORS[group]}66 inset`,
        },
        draggable: true,
        selectable: true,
      });
    }

    const groupEdgeMap = new Map<string, { from: GroupKey; to: GroupKey; weight: number }>();
    for (const edge of filteredInstanceEdges) {
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      if (!sourceNode || !targetNode) continue;

      const fromGroup = TYPE_TO_GROUP[sourceNode.type as UnifiedNodeType];
      const toGroup = TYPE_TO_GROUP[targetNode.type as UnifiedNodeType];
      const key = `${fromGroup}->${toGroup}`;
      const strength = typeof edge.data?.strength === 'number' ? edge.data.strength : 1;
      const existing = groupEdgeMap.get(key);
      if (existing) {
        existing.weight += strength;
      } else {
        groupEdgeMap.set(key, { from: fromGroup, to: toGroup, weight: strength });
      }
    }

    const groupEdges: UnifiedFlowEdge[] = applyEdgeControls(
      Array.from(groupEdgeMap.values()).map((item, index) => ({
      id: `meta-group-edge:${item.from}->${item.to}:${index}`,
      source: `meta-group:${item.from}`,
      target: `meta-group:${item.to}`,
      type: 'smoothstep',
      data: { label: `${GROUP_LABELS[item.from]} -> ${GROUP_LABELS[item.to]}`, strength: item.weight },
      label: `${item.weight}`,
      animated: item.weight > 5,
      style: {
        stroke: GROUP_COLORS[item.from],
        strokeWidth: Math.max(1, Math.min(8, 2 + item.weight / 3)),
        opacity: 0.75,
      },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: GROUP_COLORS[item.from] },
    })),
      minEdgeStrength,
      maxVisibleEdges
    );

    return { nodes: groupNodes, edges: groupEdges };
  }, [
    activeTypes,
    effectiveTier,
    filteredInstanceEdges,
    focusGroup,
    maxVisibleEdges,
    minEdgeStrength,
    visibleInstanceNodes,
  ]);

  const typeCounts = useMemo(() => {
    return visibleInstanceNodes.reduce<Record<UnifiedNodeType, number>>(
      (acc, node) => {
        const nodeType = node.type as UnifiedNodeType;
        acc[nodeType] = (acc[nodeType] ?? 0) + 1;
        return acc;
      },
        {
          session: 0,
          error: 0,
          HIT_ERROR: 0,
          agent: 0,
          pattern: 0,
          tool: 0,
          model: 0,
          skill: 0,
          concept: 0,
          solution: 0,
          template: 0,
          profile: 0,
          rule: 0,
          file: 0,
        }
    );
  }, [visibleInstanceNodes]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((existing) =>
        addEdge(
          {
            ...params,
            id: `edge:${params.source}->${params.target}:manual`,
            type: 'smoothstep',
            data: { label: 'manual', strength: 1 },
            style: { stroke: '#3f3f46', strokeWidth: 1.5 },
          },
          existing
        )
      );
    },
    [setEdges]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: UnifiedFlowNode) => {
      if (node.id.startsWith('meta-group:')) {
        const group = node.id.replace('meta-group:', '') as GroupKey;
        setFocusGroup(group);
        setFocusType(null);
        setTierOverride(1);
        setSelectedFlowNode(node);
        onNodeSelect?.(null);
        return;
      }

      if (node.id.startsWith('meta-type:')) {
        const typeValue = node.id.replace('meta-type:', '');
        if (isUnifiedNodeType(typeValue)) {
          setFocusType(typeValue);
          setTierOverride(2);
          setSelectedFlowNode(node);
          onNodeSelect?.(null);
          return;
        }
      }

      setSelectedFlowNode(node);
      setFocusNodeId(node.id);
      onNodeSelect?.(node.id);
    },
    [onNodeSelect]
  );

  const clearFocus = useCallback(() => {
    setFocusNodeId(null);
    setFocusType(null);
    setFocusGroup(null);
    setTierOverride(null);
    setSelectedFlowNode(null);
    onNodeSelect?.(null);
  }, [onNodeSelect]);

  const selectFromSearch = useCallback(() => {
    if (!normalizedSearch) return;

    const match = nodes.find((node) => {
      const haystack = `${node.id} ${node.data.label} ${node.data.pattern_type ?? ''} ${node.data.task_context ?? ''}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });

    if (!match) return;

    setSelectedFlowNode(match);
    setFocusNodeId(match.id);
    setTierOverride(2);
    setFocusType(null);
    setFocusGroup(null);
    onNodeSelect?.(match.id);
  }, [nodes, normalizedSearch, onNodeSelect]);

  const onMoveEnd = useCallback<OnMove>((_, viewport) => {
    saveViewport(viewport);
    setViewportZoom(viewport.zoom);
    if (!defaultViewport) setDefaultViewport(viewport);
  }, [defaultViewport]);

  if (loading) {
    return (
      <div className="flex min-h-[620px] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-500" />
      </div>
    );
  }

  if (error && !externalNodes) {
    return (
      <div className="rounded-xl border border-red-500/25 bg-zinc-950 p-4">
        <p className="text-sm text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => void fetchData()}
          className="mt-3 rounded-md border border-red-500/30 bg-red-600/20 px-3 py-1 text-sm text-red-200 hover:bg-red-600/30"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full min-h-[640px] w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
      <ReactFlow
        nodes={visibleGraph.nodes}
        edges={visibleGraph.edges}
        defaultViewport={defaultViewport}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onMoveEnd={onMoveEnd}
        nodeTypes={nodeTypes}
        fitView
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        minZoom={0.2}
        maxZoom={2.5}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: '#52525b', strokeWidth: 1.5 },
        }}
        className="bg-zinc-950"
      >
        <Background color="#27272a" gap={20} size={1} />
        <Controls className="border-zinc-700 bg-zinc-900 text-zinc-200" />
        <MiniMap
          pannable
          zoomable
          className="border border-zinc-700 bg-zinc-900"
          maskColor="rgba(9, 9, 11, 0.72)"
          nodeColor={(node) => {
            const nodeType = node.type as UnifiedNodeType;
            const severity = typeof node.data?.severity === 'string' ? node.data.severity : undefined;
            return nodeColor(nodeType, severity);
          }}
        />

        <Panel position="top-left" className="w-[min(560px,92vw)] rounded-xl border border-zinc-700 bg-zinc-900/90 p-3 backdrop-blur">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {KNOWN_TYPES.map((type) => {
              const enabled = activeTypes[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    setActiveTypes((prev) => ({
                      ...prev,
                      [type]: !prev[type],
                    }))
                  }
                  className={`rounded-md border px-2.5 py-1 text-xs transition ${
                    enabled
                      ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-500'
                  }`}
                  style={enabled ? { boxShadow: `inset 0 0 0 1px ${TYPE_COLORS[type]}66` } : undefined}
                >
                  {TYPE_LABEL[type]} {typeCounts[type]}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by id, label, pattern, context"
              className="min-w-[220px] flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={selectFromSearch}
              className="rounded-md border border-cyan-600/40 bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/25"
            >
              Select match
            </button>
            <button
              type="button"
              onClick={() => setFocusDepth((prev) => (prev === 1 ? 2 : 1))}
              className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              Neighborhood {focusDepth}-hop
            </button>
            <button
              type="button"
              onClick={() => setTierOverride((prev) => (prev === 0 ? null : 0))}
              className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              Group view
            </button>
            <button
              type="button"
              onClick={() => setTierOverride((prev) => (prev === 1 ? null : 1))}
              className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              Type view
            </button>
            <button
              type="button"
              onClick={() => setTierOverride((prev) => (prev === 2 ? null : 2))}
              className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              Instance view
            </button>
            <button
              type="button"
              onClick={clearFocus}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Clear focus
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            <label className="flex items-center gap-2">
              <span>Edge min strength</span>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={minEdgeStrength}
                onChange={(event) => {
                  setAutoEdgeControls(false);
                  setMinEdgeStrength(Number(event.target.value));
                }}
                className="accent-emerald-500"
              />
              <span className="font-mono text-zinc-200">{minEdgeStrength}</span>
            </label>
            <label className="flex items-center gap-2">
              <span>Max edges</span>
              <input
                type="number"
                min={25}
                max={1500}
                step={25}
                value={maxVisibleEdges}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  if (!Number.isFinite(parsed)) return;
                  setAutoEdgeControls(false);
                  setMaxVisibleEdges(Math.max(25, Math.min(1500, parsed)));
                }}
                className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100"
              />
            </label>
            <button
              type="button"
              onClick={() => setAutoEdgeControls((prev) => !prev)}
              className={`rounded-md border px-2 py-1 ${
                autoEdgeControls
                  ? 'border-emerald-600/40 bg-emerald-500/15 text-emerald-200'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-300'
              }`}
            >
              {autoEdgeControls ? 'Auto edges' : 'Manual edges'}
            </button>
            <span className="text-zinc-500">Visible edges: {visibleGraph.edges.length}</span>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Tier {effectiveTier} • zoom {viewportZoom.toFixed(2)} • drag to rearrange, scroll to zoom, click nodes to drill down.
          </p>
        </Panel>

        {selectedFlowNode ? (
          <Panel
            position="bottom-right"
            className="max-h-[56vh] w-[min(360px,94vw)] overflow-auto rounded-xl border border-zinc-700 bg-zinc-900/95 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-zinc-100">Metadata</h4>
              <button
                type="button"
                onClick={clearFocus}
                className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                close
              </button>
            </div>
            <div className="space-y-1.5 text-xs text-zinc-300">
              <div className="flex justify-between gap-3">
                <span className="text-zinc-500">id</span>
                <span className="break-all font-mono">{selectedFlowNode.id}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-zinc-500">type</span>
                <span>{TYPE_LABEL[selectedFlowNode.type as UnifiedNodeType]}</span>
              </div>
              {Object.entries(selectedFlowNode.data)
                .filter(([key]) => key !== 'label')
                .map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3 border-t border-zinc-800 pt-1">
                    <span className="text-zinc-500">{key}</span>
                    <span className="max-w-[200px] break-words text-right">{formatValue(value)}</span>
                  </div>
                ))}
            </div>
          </Panel>
        ) : null}
      </ReactFlow>
    </div>
  );
}
