declare module 'dagre' {
  export type GraphLabel = Record<string, unknown>;
  export type NodeConfig = Record<string, unknown>;
  export type EdgeConfig = Record<string, unknown>;
  export class graphlib {
    static Graph: new () => {
      setDefaultEdgeLabel: (fn: () => Record<string, unknown>) => void;
      setGraph: (label: GraphLabel) => void;
      setNode: (id: string, label: NodeConfig) => void;
      setEdge: (source: string, target: string, label?: EdgeConfig) => void;
      node: (id: string) => { x: number; y: number; width: number; height: number };
      nodes: () => string[];
      edges: () => Array<{ v: string; w: string }>;
      edge: (edge: { v: string; w: string }) => EdgeConfig;
    };
  }
  export function layout(graph: InstanceType<typeof graphlib.Graph>): void;
}
