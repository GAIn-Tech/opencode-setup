import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnConnect,
  type OnEdgesChange,
  type OnMove,
  type OnNodesChange,
  type Viewport,
} from '@xyflow/react';

type GraphCanvasProps = {
  nodes: Node[];
  edges: Edge[];
  defaultViewport: Viewport | undefined;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect | ((connection: Connection) => void);
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onMoveEnd: OnMove;
  nodeTypes: NodeTypes;
  nodeColor: (node: Node) => string;
  children: React.ReactNode;
};

type GraphCanvasGenericProps<TNode extends Node, TEdge extends Edge> = Omit<GraphCanvasProps, 'nodes' | 'edges' | 'onNodesChange' | 'onEdgesChange' | 'onNodeClick' | 'nodeTypes'> & {
  nodes: TNode[];
  edges: TEdge[];
  onNodesChange: OnNodesChange<TNode>;
  onEdgesChange: OnEdgesChange<TEdge>;
  onNodeClick: (event: React.MouseEvent, node: TNode) => void;
  nodeTypes: NodeTypes;
};

export function GraphCanvas<TNode extends Node, TEdge extends Edge>({
  nodes,
  edges,
  defaultViewport,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onMoveEnd,
  nodeTypes,
  nodeColor,
  children,
}: GraphCanvasGenericProps<TNode, TEdge>) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      defaultViewport={defaultViewport}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onMoveEnd={onMoveEnd}
      nodeTypes={nodeTypes}
      fitView
      onlyRenderVisibleElements
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
        nodeColor={nodeColor}
      />
      {children}
    </ReactFlow>
  );
}
