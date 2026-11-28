import { DownloadIcon, UploadIcon } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useRef } from 'react';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import type { StudioGraphDocument } from '../model/agent-graph-document';
import { exportAgentGraph, readAgentGraphFile } from '../model/agent-graph-transfer';

export interface AgentGraphTransferBarProps {
  agentName?: string;
  getDocument: () => StudioGraphDocument;
  onImported: (doc: StudioGraphDocument) => void;
}

export function AgentGraphTransferBar({
  agentName,
  getDocument,
  onImported,
}: AgentGraphTransferBarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const onExport = useCallback(() => {
    const doc = getDocument();
    exportAgentGraph(doc, agentName ?? 'agent');
    toast.add({
      title: 'Graph exported',
      description: `${Object.keys(doc.nodes).length} nodes, ${doc.edges.length} edges`,
      type: 'success',
    });
  }, [agentName, getDocument]);
  const onPickFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) {
        return;
      }
      const result = await readAgentGraphFile(file);
      if (!result.doc) {
        toast.add({
          title: 'Import failed',
          description: result.error ?? 'invalid file',
          type: 'error',
        });
        return;
      }
      onImported(result.doc);
      toast.add({
        title: 'Graph imported',
        description:
          result.droppedEdges && result.droppedEdges > 0
            ? `${Object.keys(result.doc.nodes).length} nodes, ${result.doc.edges.length} edges; ${result.droppedEdges} dangling edges dropped`
            : `${Object.keys(result.doc.nodes).length} nodes, ${result.doc.edges.length} edges`,
        type: result.droppedEdges && result.droppedEdges > 0 ? 'warning' : 'success',
      });
    },
    [onImported],
  );
  return (
    <div className="pointer-events-auto absolute top-2 left-2 z-10 flex items-center gap-0.5 rounded-lg border border-border/80 bg-popover/95 px-1 py-0.5 shadow-md backdrop-blur-sm">
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        aria-label="Export graph"
        data-testid="graph-export"
        onClick={onExport}
      >
        <DownloadIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        aria-label="Import graph"
        data-testid="graph-import"
        onClick={() => fileRef.current?.click()}
      >
        <UploadIcon />
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        data-testid="graph-import-file"
        onChange={(event) => void onPickFile(event)}
      />
    </div>
  );
}
