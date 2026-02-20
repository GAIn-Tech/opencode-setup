import { NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fs from 'fs';

export const dynamic = 'force-dynamic';

interface GraphQueryOptions {
  sinceDays: number;
  maxFanout: number;
  focus?: string;
  depth: number;
  maxNodes: number;
}

// Enhanced node types for comprehensive KG
interface GraphNode {
  id: string;
  type: 'session' | 'error' | 'agent' | 'tool' | 'model' | 'skill' | 'pattern' | 'concept' | 'solution' | 'template' | 'profile' | 'rule';
  label?: string;
  count: number;
  data?: Record<string, unknown>;
}

interface GraphEdge {
  from: string;
  to: string;
  weight: number;
  type: 'uses_agent' | 'uses_tool' | 'uses_model' | 'has_error' | 'uses_skill' | 'solves_with' | 'follows_pattern' | 'delegates_to' | 'learns_from' | 'uses_template' | 'has_profile' | 'matches_rule';
}

// Read from multiple .opencode data sources
function normalizeFocusId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const idx = trimmed.indexOf(':');
  return idx > 0 ? trimmed.slice(idx + 1) : trimmed;
}

function hasTokenMatch(haystack: string, token: string): boolean {
  const normalizedToken = token.trim().toLowerCase();
  if (!normalizedToken) return false;
  const chunks = haystack.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return chunks.includes(normalizedToken);
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function limitFanout(edges: GraphEdge[], maxFanout: number): GraphEdge[] {
  if (maxFanout <= 0) return edges;

  const bySource = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const list = bySource.get(edge.from) ?? [];
    list.push(edge);
    bySource.set(edge.from, list);
  }

  const limited: GraphEdge[] = [];
  for (const sourceEdges of bySource.values()) {
    sourceEdges.sort((a, b) => b.weight - a.weight);
    limited.push(...sourceEdges.slice(0, maxFanout));
  }

  return limited;
}

function buildFocusedSubgraph(nodes: GraphNode[], edges: GraphEdge[], focus: string, depth: number, maxNodes: number) {
  const normalizedFocus = normalizeFocusId(focus);
  if (!normalizedFocus) {
    return { nodes, edges };
  }

  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set());
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  const visited = new Set<string>([normalizedFocus]);
  let frontier = new Set<string>([normalizedFocus]);

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

  let filteredNodes = nodes.filter((node) => visited.has(node.id));
  if (filteredNodes.length === 0) {
    filteredNodes = nodes;
  }

  filteredNodes.sort((a, b) => b.count - a.count);
  const cappedNodeIds = new Set(filteredNodes.slice(0, maxNodes).map((node) => node.id));
  if (cappedNodeIds.size > 0 && !cappedNodeIds.has(normalizedFocus)) {
    cappedNodeIds.add(normalizedFocus);
  }

  const focusedNodes = nodes.filter((node) => cappedNodeIds.has(node.id));
  const focusedEdges = edges.filter((edge) => cappedNodeIds.has(edge.from) && cappedNodeIds.has(edge.to));
  return { nodes: focusedNodes, edges: focusedEdges };
}

function readOpenCodeData(opencodePath: string, options: GraphQueryOptions) {
  const data: { nodes: GraphNode[]; edges: GraphEdge[]; meta: Record<string, unknown> } = {
    nodes: [],
    edges: [],
    meta: {}
  };
  
  const nodesMap = new Map<string, GraphNode>();
  const edgesMap = new Map<string, GraphEdge>();
  
  function addNode(id: string, type: GraphNode['type'], count = 1, extraData?: Record<string, unknown>) {
    const key = `${type}:${id}`;
    if (nodesMap.has(key)) {
      const node = nodesMap.get(key)!;
      node.count += count;
    } else {
      nodesMap.set(key, { id, type, count, data: extraData });
    }
  }
  
  function addEdge(from: string, to: string, type: GraphEdge['type'], weight = 1) {
    const key = `${from}->${to}:${type}`;
    if (edgesMap.has(key)) {
      edgesMap.get(key)!.weight += weight;
    } else {
      edgesMap.set(key, { from, to, type, weight });
    }
  }
  
  // 1. Read messages (sessions)
  const messagesPath = path.join(opencodePath, 'messages');
  if (fs.existsSync(messagesPath)) {
    const sessionDirs = fs.readdirSync(messagesPath).filter(f => {
      try {
        return fs.statSync(path.join(messagesPath, f)).isDirectory();
      } catch { return false; }
    });
    
    const cutoffTime = Date.now() - options.sinceDays * 24 * 60 * 60 * 1000;

    for (const sessionId of sessionDirs) {
      const sessionPath = path.join(messagesPath, sessionId);
      try {
        const stats = fs.statSync(sessionPath);
        if (stats.mtimeMs < cutoffTime) {
          continue;
        }
      } catch {
        continue;
      }

      addNode(sessionId, 'session', 1, { source: 'messages' });

      const files = fs.readdirSync(sessionPath).filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(sessionPath, file), 'utf-8');
          let msg: any;
          try {
            msg = JSON.parse(content);
          } catch (e: any) {
            console.warn('[memory-graph] Skipping malformed entry:', e?.message || e);
            continue;
          }
          
          // Extract agent
          if (msg.agent) {
            addNode(msg.agent, 'agent', 1);
            addEdge(sessionId, msg.agent, 'uses_agent');
          }
          
          // Extract tools
          if (msg.tools && Array.isArray(msg.tools)) {
            for (const tool of msg.tools) {
              const toolId = typeof tool === 'string' ? tool : tool?.name || tool?.id || 'unknown';
              addNode(toolId, 'tool', 1);
              addEdge(sessionId, toolId, 'uses_tool');
            }
          }
          
          // Extract models used
          if (msg.model) {
            const modelId = typeof msg.model === 'string'
              ? msg.model
              : (msg.model.modelID || msg.model.id || `${msg.model.providerID || 'unknown'}:${msg.model.modelID || 'unknown'}`);
            addNode(modelId, 'model', 1, { provider: msg.model.providerID });
            addEdge(sessionId, modelId, 'uses_model');
          }
          
          // Extract errors
          const contentStr = JSON.stringify(msg);
          const errorMatches = contentStr.match(/(Error|Exception|failed|Failed|timeout|Timeout)/g) || [];
          for (const match of errorMatches) {
            addNode(match, 'error', 1);
            addEdge(sessionId, match, 'has_error');
          }
          
          // Extract skills used
          if (msg.skills && Array.isArray(msg.skills)) {
            for (const skill of msg.skills) {
              const skillId = typeof skill === 'string' ? skill : skill.name || skill.id || 'unknown';
              addNode(skillId, 'skill', 1);
              addEdge(sessionId, skillId, 'uses_skill');
            }
          }
          
          // Extract solutions/tasks
          if (msg.taskType || msg.intent || msg.action) {
            const solution = msg.taskType || msg.intent || msg.action;
            addNode(solution, 'solution', 1);
            addEdge(sessionId, solution, 'solves_with');
          }
        } catch (e: any) {
          console.warn('[memory-graph] Skipping malformed entry:', e?.message || e);
        }
      }
    }
    data.meta.sessions = sessionDirs.length;
  }
  
  // 2. Read learning data (patterns)
  const learningPath = path.join(opencodePath, 'learning');
  if (fs.existsSync(learningPath)) {
    const files = fs.readdirSync(learningPath).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(learningPath, file), 'utf-8');
        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch (e: any) {
          console.warn('[memory-graph] Skipping malformed entry:', e?.message || e);
          continue;
        }
        const patternsArray = Array.isArray(parsed)
          ? parsed
          : (parsed.patterns || parsed.items || []);
        
        if (Array.isArray(patternsArray)) {
          for (const pattern of patternsArray) {
            const patternType = file.includes('anti') ? 'anti-pattern' : 'positive-pattern';
            const patternId = pattern.type || pattern.name || pattern.id || file;
            const count = pattern.occurrences || pattern.count || 1;
            
            addNode(patternId, 'pattern', count, { patternType, ...pattern });
            
            // Context links
            if (pattern.context?.agent) {
              addNode(pattern.context.agent, 'agent', 1);
              addEdge(pattern.context.agent, patternId, 'learns_from', 1);
            }
            if (pattern.context?.error_type) {
              addNode(pattern.context.error_type, 'error', 1);
              addEdge(patternId, pattern.context.error_type, 'has_error', 1);
            }
            if (pattern.context?.task_type) {
              addNode(pattern.context.task_type, 'solution', 1);
              addEdge(patternId, pattern.context.task_type, 'solves_with', 1);
            }
            if (pattern.severity) {
              addNode(`severity:${pattern.severity}`, 'concept', 1);
              addEdge(patternId, `severity:${pattern.severity}`, 'follows_pattern', 1);
            }
          }
        }
      } catch (e: any) {
        console.warn('[memory-graph] Skipping malformed entry:', e?.message || e);
      }
    }
  }
  
  // 3. Read skills data (skill-rl.json + local skill definitions)
  const skillRLPath = path.join(opencodePath, 'skill-rl.json');
  if (fs.existsSync(skillRLPath)) {
    try {
      const content = fs.readFileSync(skillRLPath, 'utf-8');
      let skillData: any;
      try {
        skillData = JSON.parse(content);
      } catch (e: any) {
        console.warn('[memory-graph] Skipping malformed entry:', e?.message || e);
        skillData = null;
      }
      if (skillData) {
        const general = skillData.skillBank?.general || [];
        const taskSpecific = skillData.skillBank?.taskSpecific || [];

        for (const skill of general) {
          const skillId = skill.name || skill.id;
          if (!skillId) continue;
          addNode(skillId, 'skill', skill.usage_count || 1, skill);
          if (skill.success_rate !== undefined) {
            addNode(`success:${skillId}`, 'concept', 1, { rate: skill.success_rate });
          }
        }
        for (const skill of taskSpecific) {
          const skillId = skill.name || skill.id;
          if (!skillId) continue;
          addNode(skillId, 'skill', skill.usage_count || 1, skill);
          if (skill.task_type) {
            addNode(skill.task_type, 'solution', 1);
            addEdge(skillId, skill.task_type, 'solves_with', 1);
          }
        }
      }
    } catch (e: any) {
      console.warn('[memory-graph] Skipping malformed entry:', e?.message || e);
    }
  }
  
  const skillsPath = path.join(os.homedir(), '.config', 'opencode', 'skills');
  if (fs.existsSync(skillsPath)) {
    const skillDirs = fs.readdirSync(skillsPath).filter(f => {
      try { return fs.statSync(path.join(skillsPath, f)).isDirectory(); } catch { return false; }
    });
    
    for (const dir of skillDirs) {
      addNode(dir, 'skill', 1, { source: 'skill-definition' });
    }
  }

  // 3b. Read agent definitions from config (framework agents)
  const agentsPath = path.join(os.homedir(), '.config', 'opencode', 'agents');
  if (fs.existsSync(agentsPath)) {
    const agentFiles = fs.readdirSync(agentsPath).filter(f => f.endsWith('.md') || f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml'));
    
    for (const file of agentFiles) {
      const agentId = file.replace(/\.(md|json|yaml|yml)$/, '');
      addNode(agentId, 'agent', 1, { source: 'agent-definition' });
    }
    data.meta.frameworkAgents = agentFiles.length;
  }
  
  // 4. Read templates
  const templatesPath = path.join(opencodePath, 'templates');
  if (fs.existsSync(templatesPath)) {
    const templateEntries = fs.readdirSync(templatesPath);
    
      for (const entry of templateEntries) {
        addNode(entry, 'template', 1, { source: 'templates' });

        // Connect sessions using this template (by name match)
        for (const node of nodesMap.values()) {
          if (node.type === 'session' && hasTokenMatch(node.id, entry)) {
            addEdge(node.id, entry, 'uses_template');
          }
        }
    }
    data.meta.templates = templateEntries.length;
  }
  
  // 5. Read profiles
  const profilesPath = path.join(opencodePath, 'profiles');
  if (fs.existsSync(profilesPath)) {
    const profileFiles = fs.readdirSync(profilesPath).filter(f => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json'));
    
      for (const file of profileFiles) {
        const profileId = file.replace(/\.(yaml|yml|json)$/, '');
        addNode(profileId, 'profile', 1, { source: 'profiles' });

        // Connect sessions with this profile (by name match)
        for (const node of nodesMap.values()) {
          if (node.type === 'session' && hasTokenMatch(node.id, profileId)) {
            addEdge(node.id, profileId, 'has_profile');
          }
        }
    }
    data.meta.profiles = profileFiles.length;
  }
  
  // 6. Read global rules
  const rulesPath = path.join(opencodePath, 'global-rules');
  if (fs.existsSync(rulesPath)) {
    const ruleFiles = fs.readdirSync(rulesPath).filter(f => f.endsWith('.mdc') || f.endsWith('.json'));
    
    for (const file of ruleFiles) {
      const ruleId = file.replace(/\.(mdc|json)$/, '');
      addNode(ruleId, 'rule', 1, { source: 'global-rules' });
      
      // Connect concepts that match this rule
      for (const [nodeKey, node] of nodesMap) {
        if (node.type === 'concept' && node.id.includes(ruleId)) {
          addEdge(node.id, ruleId, 'matches_rule');
        }
      }
    }
    data.meta.rules = ruleFiles.length;
  }
  
  // 7. Read parts (component library)
  const partsPath = path.join(opencodePath, 'parts');
  if (fs.existsSync(partsPath)) {
    const parts = fs.readdirSync(partsPath).filter(f => f.endsWith('.json'));
    
    for (const file of parts) {
      try {
        const content = fs.readFileSync(path.join(partsPath, file), 'utf-8');
        const part = JSON.parse(content);
        
        if (part.name || part.id) {
          addNode(part.name || part.id, 'concept', 1, part);
        }
      } catch { /* skip */ }
    }
    data.meta.parts = parts.length;
  }
  
  // Convert maps to arrays
  data.nodes = Array.from(nodesMap.values());
  data.edges = limitFanout(Array.from(edgesMap.values()), options.maxFanout);

  if (options.focus) {
    const focused = buildFocusedSubgraph(data.nodes, data.edges, options.focus, options.depth, options.maxNodes);
    data.nodes = focused.nodes;
    data.edges = focused.edges;
    data.meta.focus = options.focus;
    data.meta.focusDepth = options.depth;
  }
  
  // Add meta counts
  const nodeTypeCounts: Record<string, number> = {};
  for (const node of data.nodes) {
    nodeTypeCounts[node.type] = (nodeTypeCounts[node.type] || 0) + 1;
  }
  data.meta.nodeTypes = nodeTypeCounts;
  data.meta.totalNodes = data.nodes.length;
  data.meta.totalEdges = data.edges.length;
  
  return data;
}

export async function GET(request: Request) {
  try {
    const homeDir = os.homedir();
    const opencodePath = path.join(homeDir, '.opencode');
    
    // Check if .opencode directory exists
    if (!fs.existsSync(opencodePath)) {
      return NextResponse.json({
        nodes: [],
        edges: [],
        meta: { message: 'No .opencode directory found' }
      });
    }
    
    const search = new URL(request.url).searchParams;

    const options: GraphQueryOptions = {
      sinceDays: clamp(parsePositiveInt(search.get('sinceDays'), 7), 1, 90),
      maxFanout: clamp(parsePositiveInt(search.get('maxFanout'), 15), 1, 100),
      focus: search.get('focus') ?? undefined,
      depth: clamp(parsePositiveInt(search.get('depth'), 2), 1, 4),
      maxNodes: clamp(parsePositiveInt(search.get('maxNodes'), 120), 20, 1000),
    };

    // Read all OpenCode data sources
    const data = readOpenCodeData(opencodePath, options);
    
    return NextResponse.json({
      ...data,
      meta: {
        ...data.meta,
        source: '~/.opencode (messages, learning, skills, templates, profiles, rules, parts)',
        sinceDays: options.sinceDays,
        maxFanout: options.maxFanout,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Memory Graph API] Error:', error);
    return NextResponse.json({
      nodes: [],
      edges: [],
      meta: { error: String(error), message: 'Error reading memory data' }
    }, { status: 200 });
  }
}
