import type { Edge as FlowEdge, Node as FlowNode } from '@xyflow/react';
import type { Edge, Expr, Node } from 'harnesys';
export type GraphRankdir = 'TB' | 'LR';
export interface GraphNodePosition {
  x: number;
  y: number;
}
export interface StudioGraphLayout {
  rankdir: GraphRankdir;
  positions: Record<string, GraphNodePosition>;
}
export interface StudioGraphDocument {
  nodes: Record<string, Node>;
  edges: Edge[];
  layout?: StudioGraphLayout;
  /** Node id of the default (primary) llm:generate node; its model follows the agent default. */
  primary?: string;
}
export interface HarnesysGraph {
  nodes: Record<string, Node>;
  edges: Edge[];
}
export interface AgentGraphFlowNodeData {
  spec: Node;
  rankdir: GraphRankdir;
  primary?: string;
  [key: string]: unknown;
}
export interface AgentGraphFlowEdgeData {
  when?: Expr;
  [key: string]: unknown;
}
export type AgentGraphFlowNode = FlowNode<AgentGraphFlowNodeData, 'agent-graph-node'>;
export type AgentGraphFlowEdge = FlowEdge<AgentGraphFlowEdgeData>;
const DEFAULT_THINK: Node = {
  type: 'llm:generate',
  prompt: 'main',
  messages: '$state.messages',
};
const DEFAULT_REACT_NODES: Record<string, Node> = {
  start: { type: 'core:start' },
  think: DEFAULT_THINK,
  act: {
    type: 'tool:call',
    calls: '$output.toolCalls',
    concurrency: 'parallel',
  },
  end: { type: 'core:end' },
};
const DEFAULT_REACT_EDGES: Edge[] = [
  { from: 'start', to: 'think' },
  { from: 'think', to: 'act', when: '$output.finishReason = "tool-calls"' },
  { from: 'think', to: 'end', when: '$output.finishReason = "stop"' },
  { from: 'think', to: 'end' },
  { from: 'act', to: 'think' },
];
export function harnesysGraphOf(doc: StudioGraphDocument): HarnesysGraph {
  return { nodes: doc.nodes, edges: doc.edges };
}
export function defaultReactGraph(): StudioGraphDocument {
  return {
    nodes: { ...DEFAULT_REACT_NODES },
    edges: DEFAULT_REACT_EDGES.map((edge) => ({ ...edge })),
  };
}
export const ROUTE_DEFAULT_HANDLE = 'route:__default__';
export function routeHandleExpr(routeKey: string): string {
  return `$output.route = "${routeKey}"`;
}
function routeHandleOf(edge: Edge, sourceType: string | undefined): string | undefined {
  if (sourceType !== 'control:route') {
    return undefined;
  }
  const match =
    edge.when !== undefined
      ? /^\$output\.route\s*=\s*"([A-Za-z][A-Za-z0-9_-]*)"$/.exec(edge.when)
      : null;
  return match ? `route:${match[1]}` : ROUTE_DEFAULT_HANDLE;
}
export function toFlow(doc: StudioGraphDocument): {
  nodes: AgentGraphFlowNode[];
  edges: AgentGraphFlowEdge[];
} {
  const rankdir = doc.layout?.rankdir ?? 'TB';
  const positions = doc.layout?.positions ?? {};
  const nodes: AgentGraphFlowNode[] = Object.entries(doc.nodes).map(([id, spec]) => {
    const position = positions[id] ?? { x: 0, y: 0 };
    return {
      id,
      type: 'agent-graph-node',
      position,
      data: { spec, rankdir, ...(doc.primary !== undefined ? { primary: doc.primary } : {}) },
    };
  });
  const edges: AgentGraphFlowEdge[] = doc.edges.map((edge, index) => ({
    id: `e-${index}-${edge.from}-${edge.to}`,
    source: edge.from,
    target: edge.to,
    ...(routeHandleOf(edge, doc.nodes[edge.from]?.type) !== undefined
      ? { sourceHandle: routeHandleOf(edge, doc.nodes[edge.from]?.type) }
      : {}),
    data: edge.when !== undefined ? { when: edge.when } : {},
  }));
  return { nodes, edges };
}
export function fromFlow(
  nodes: AgentGraphFlowNode[],
  edges: AgentGraphFlowEdge[],
  rankdir: GraphRankdir,
): StudioGraphDocument {
  const graphNodes: Record<string, Node> = {};
  const positions: Record<string, GraphNodePosition> = {};
  for (const node of nodes) {
    graphNodes[node.id] = node.data.spec;
    positions[node.id] = { x: node.position.x, y: node.position.y };
  }
  const graphEdges: Edge[] = edges.map((edge) => {
    const when = edge.data?.when;
    if (when !== undefined && when !== '') {
      return { from: edge.source, to: edge.target, when };
    }
    return { from: edge.source, to: edge.target };
  });
  return {
    nodes: graphNodes,
    edges: graphEdges,
    layout: { rankdir, positions },
  };
}
