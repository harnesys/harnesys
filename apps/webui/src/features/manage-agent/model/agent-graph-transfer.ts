import type { Edge, Node } from 'harnesys';
import { z } from 'zod';
import { downloadJson } from '@/shared/lib/download-json';
import type { StudioGraphDocument } from './agent-graph-document';

const GraphNodeFileSchema = z
  .object({ type: z.string() })
  .catchall(z.unknown())
  .transform((spec) => spec as Node);
const GraphEdgeFileSchema = z.object({
  from: z.string(),
  to: z.string(),
  when: z.string().optional(),
});
const GraphFileSchema = z.object({
  nodes: z.record(z.string(), GraphNodeFileSchema),
  edges: z.array(GraphEdgeFileSchema),
  layout: z
    .object({
      rankdir: z.enum(['TB', 'LR']),
      positions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
    })
    .optional(),
  primary: z.string().optional(),
  toolPolicy: z.literal('explicit').optional(),
});

export interface AgentGraphImportResult {
  doc?: StudioGraphDocument;
  droppedEdges?: number;
  error?: string;
}

function fileNameOf(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'agent'}-graph.json`;
}

export function exportAgentGraph(doc: StudioGraphDocument, name: string): void {
  downloadJson(fileNameOf(name), doc);
}

/** Parse and validate a graph file; dangling edges and a missing primary reference are dropped. */
export async function readAgentGraphFile(file: File): Promise<AgentGraphImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid JSON' };
  }
  const result = GraphFileSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      error: issue
        ? `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`
        : 'Invalid graph document',
    };
  }
  const nodes = result.data.nodes;
  if (Object.keys(nodes).length === 0) {
    return { error: 'Graph has no nodes' };
  }
  let droppedEdges = 0;
  const edges: Edge[] = [];
  for (const edge of result.data.edges) {
    if (nodes[edge.from] === undefined || nodes[edge.to] === undefined) {
      droppedEdges += 1;
      continue;
    }
    edges.push(edge);
  }
  const primary =
    result.data.primary !== undefined && nodes[result.data.primary] !== undefined
      ? result.data.primary
      : undefined;
  return {
    doc: {
      nodes,
      edges,
      ...(result.data.layout ? { layout: result.data.layout } : {}),
      ...(primary !== undefined ? { primary } : {}),
      ...(result.data.toolPolicy !== undefined ? { toolPolicy: result.data.toolPolicy } : {}),
    },
    droppedEdges,
  };
}
