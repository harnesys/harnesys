import '@xyflow/react/dist/style.css';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import type { Diagnostic, Edge, Node } from 'harnesys';
import { useCallback, useEffect, useRef, useState } from 'react';
import { nextNodeId, specByType } from '../model/agent-graph-catalog';
import {
  type AgentGraphFlowEdge,
  type AgentGraphFlowNode,
  defaultReactGraph,
  ensurePositions,
  fromFlow,
  type GraphRankdir,
  type StudioGraphDocument,
  toFlow,
  withDefaultEdges,
} from '../model/agent-graph-document';
import { AgentGraphCanvas } from './agent-graph-canvas';
import { AgentGraphInspector, type AgentGraphSelection } from './agent-graph-inspector';
import { AgentGraphPalette } from './agent-graph-palette';
import { AgentGraphTransferBar } from './agent-graph-transfer-bar';
export interface AgentGraphPaneProps {
  value?: StudioGraphDocument | null;
  onChange?: (doc: StudioGraphDocument) => void;
  diagnostics?: Diagnostic[];
  agentModelId?: string | null;
  agentName?: string;
}
export function AgentGraphPane(props: AgentGraphPaneProps) {
  return (
    <ReactFlowProvider>
      <AgentGraphPaneInner {...props} />
    </ReactFlowProvider>
  );
}
function AgentGraphPaneInner({
  value,
  onChange,
  diagnostics = [],
  agentModelId,
  agentName,
}: AgentGraphPaneProps) {
  const [initialDoc] = useState(() => ensurePositions(value ?? defaultReactGraph()));
  const [nodes, setNodes] = useState<AgentGraphFlowNode[]>(() => toFlow(initialDoc).nodes);
  const [edges, setEdges] = useState<AgentGraphFlowEdge[]>(() => toFlow(initialDoc).edges);
  const [rankdir, setRankdir] = useState<GraphRankdir>(initialDoc.layout?.rankdir ?? 'TB');
  const [primaryId, setPrimaryId] = useState<string | undefined>(initialDoc.primary);
  const [toolPolicy, setToolPolicy] = useState<'explicit' | undefined>(initialDoc.toolPolicy);
  const [selection, setSelection] = useState<AgentGraphSelection>(null);
  const { fitView } = useReactFlow();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) {
      return;
    }
    seeded.current = true;
    const doc = ensurePositions(value ?? defaultReactGraph());
    onChange?.(doc);
  }, [onChange, value]);
  const emit = useCallback(
    (
      nextNodes: AgentGraphFlowNode[],
      nextEdges: AgentGraphFlowEdge[],
      nextRankdir: GraphRankdir,
      nextPrimary: string | undefined = primaryId,
      nextToolPolicy: 'explicit' | undefined = toolPolicy,
    ) => {
      const doc = fromFlow(nextNodes, nextEdges, nextRankdir);
      onChange?.({
        ...doc,
        ...(nextPrimary !== undefined ? { primary: nextPrimary } : {}),
        ...(nextToolPolicy !== undefined ? { toolPolicy: nextToolPolicy } : {}),
      });
    },
    [onChange, primaryId, toolPolicy],
  );
  const replaceNodes = useCallback(
    (next: AgentGraphFlowNode[]) => {
      setNodes(next);
      emit(next, edges, rankdir);
    },
    [edges, emit, rankdir],
  );
  const replaceEdges = useCallback(
    (next: AgentGraphFlowEdge[]) => {
      setEdges(next);
      emit(nodes, next, rankdir);
    },
    [emit, nodes, rankdir],
  );
  const addNode = useCallback(
    (
      type: string,
      position?: {
        x: number;
        y: number;
      },
    ) => {
      const catalog = specByType(type);
      if (!catalog) {
        return;
      }
      const id = nextNodeId(
        type,
        nodes.map((node) => node.id),
      );
      const nextNode: AgentGraphFlowNode = {
        id,
        type: 'agent-graph-node',
        position: position ?? { x: 80 + nodes.length * 24, y: 80 + nodes.length * 16 },
        data: { spec: catalog.defaults(), rankdir },
      };
      const nextNodes = [...nodes, nextNode];
      const nextEdges = withDefaultEdges(nodes, edges, nextNode);
      setNodes(nextNodes);
      setEdges(nextEdges);
      emit(nextNodes, nextEdges, rankdir);
    },
    [edges, emit, nodes, rankdir],
  );
  const onChangeNode = useCallback(
    (id: string, node: Node) => {
      const nextNodes = nodes.map((item) =>
        item.id === id ? { ...item, data: { ...item.data, spec: node } } : item,
      );
      setNodes(nextNodes);
      emit(nextNodes, edges, rankdir);
      setSelection({ kind: 'node', id, node });
    },
    [edges, emit, nodes, rankdir],
  );
  const onRenameNode = useCallback(
    (fromId: string, toId: string) => {
      const trimmed = toId.trim();
      if (trimmed === '' || trimmed === fromId) {
        return;
      }
      if (nodes.some((node) => node.id === trimmed)) {
        return;
      }
      const nextNodes = nodes.map((node) => (node.id === fromId ? { ...node, id: trimmed } : node));
      const nextEdges = edges.map((edge) => ({
        ...edge,
        source: edge.source === fromId ? trimmed : edge.source,
        target: edge.target === fromId ? trimmed : edge.target,
      }));
      setNodes(nextNodes);
      setEdges(nextEdges);
      emit(nextNodes, nextEdges, rankdir);
      const renamed = nextNodes.find((node) => node.id === trimmed);
      if (renamed) {
        setSelection({ kind: 'node', id: trimmed, node: renamed.data.spec });
      }
    },
    [edges, emit, nodes, rankdir],
  );
  const onChangeEdge = useCallback(
    (index: number, edge: Edge) => {
      const current = edges[index];
      if (!current) {
        return;
      }
      const nextEdges = edges.map((item, i) =>
        i === index
          ? {
              ...item,
              source: edge.from,
              target: edge.to,
              data: edge.when !== undefined ? { when: edge.when } : {},
            }
          : item,
      );
      setEdges(nextEdges);
      emit(nodes, nextEdges, rankdir);
      setSelection({ kind: 'edge', index, edge });
    },
    [edges, emit, nodes, rankdir],
  );
  const onSelectionChange = useCallback(
    ({ nodeIds, edgeIds }: { nodeIds: string[]; edgeIds: string[] }) => {
      if (nodeIds.length === 1) {
        const node = nodes.find((item) => item.id === nodeIds[0]);
        if (node) {
          setSelection({ kind: 'node', id: node.id, node: node.data.spec });
          return;
        }
      }
      if (edgeIds.length === 1) {
        const index = edges.findIndex((item) => item.id === edgeIds[0]);
        const flowEdge = edges[index];
        if (flowEdge) {
          setSelection({
            kind: 'edge',
            index,
            edge: {
              from: flowEdge.source,
              to: flowEdge.target,
              ...(flowEdge.data?.when !== undefined ? { when: flowEdge.data.when } : {}),
            },
          });
          return;
        }
      }
      setSelection(null);
    },
    [edges, nodes],
  );
  const onRankdirChange = useCallback(
    (next: GraphRankdir) => {
      setRankdir(next);
      emit(nodes, edges, next);
    },
    [edges, emit, nodes],
  );
  const onPrimaryChange = useCallback(
    (next: string | undefined) => {
      setPrimaryId(next);
      setNodes(nodes.map((node) => ({ ...node, data: { ...node.data, primary: next } })));
      emit(nodes, edges, rankdir, next);
    },
    [edges, emit, nodes, rankdir],
  );
  const buildDocument = useCallback(
    (): StudioGraphDocument => ({
      ...fromFlow(nodes, edges, rankdir),
      ...(primaryId !== undefined ? { primary: primaryId } : {}),
      ...(toolPolicy !== undefined ? { toolPolicy } : {}),
    }),
    [edges, nodes, primaryId, rankdir, toolPolicy],
  );
  const applyImportedGraph = useCallback(
    (doc: StudioGraphDocument) => {
      const prepared = ensurePositions(doc);
      const flow = toFlow(prepared);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setRankdir(prepared.layout?.rankdir ?? 'TB');
      setPrimaryId(prepared.primary);
      setToolPolicy(prepared.toolPolicy);
      setSelection(null);
      emit(
        flow.nodes,
        flow.edges,
        prepared.layout?.rankdir ?? 'TB',
        prepared.primary,
        prepared.toolPolicy,
      );
      requestAnimationFrame(() => {
        void fitView({ padding: 0.2, duration: 200 });
      });
    },
    [emit, fitView],
  );
  return (
    <div className="relative min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-md border border-border">
      <AgentGraphCanvas
        nodes={nodes}
        edges={edges}
        rankdir={rankdir}
        onNodesChange={replaceNodes}
        onEdgesChange={replaceEdges}
        onRankdirChange={onRankdirChange}
        onDropType={(type, position) => addNode(type, position)}
        onSelectionChange={onSelectionChange}
      />
      <div className="pointer-events-none absolute inset-0 z-10">
        <AgentGraphTransferBar
          agentName={agentName}
          getDocument={buildDocument}
          onImported={applyImportedGraph}
        />
        <div className="pointer-events-auto absolute top-1/2 left-2 z-10 w-10 -translate-y-1/2">
          <AgentGraphPalette onAdd={(type) => addNode(type)} />
        </div>
        <div className="pointer-events-auto absolute top-2 right-2 flex max-h-[calc(100%-1rem)] w-48 flex-col overflow-hidden rounded-lg border border-border/80 bg-popover/95 shadow-md backdrop-blur-sm">
          <AgentGraphInspector
            selection={selection}
            diagnostics={diagnostics}
            onChangeNode={onChangeNode}
            onRenameNode={onRenameNode}
            onChangeEdge={onChangeEdge}
            agentModelId={agentModelId}
            primaryNodeId={primaryId}
            onPrimaryChange={onPrimaryChange}
          />
        </div>
      </div>
    </div>
  );
}
