import type { ThreadActiveRun } from '@harnesys/studio-shared';
import { Badge } from './badge';

export interface RunAttribution {
  startedByName?: string;
  via?: 'direct' | 'agent';
  onNodeId?: string | null;
  onNodeName?: string;
}

export function runAttributionParts(
  attribution: RunAttribution | ThreadActiveRun | null | undefined,
): string[] {
  if (!attribution) {
    return [];
  }
  const parts: string[] = [];
  if (attribution.startedByName) {
    parts.push(`by ${attribution.startedByName}`);
  }
  if (attribution.via) {
    parts.push(attribution.via);
  }
  const node = attribution.onNodeName ?? shortNodeId(attribution.onNodeId);
  if (node) {
    parts.push(node);
  }
  return parts;
}

function shortNodeId(nodeId: string | null | undefined): string | undefined {
  if (!nodeId) {
    return undefined;
  }
  return nodeId.slice(0, 8);
}

export function RunAttributionBadge({ run }: { run: ThreadActiveRun | null | undefined }) {
  const text = runAttributionParts(run).join(' · ');
  if (!text) {
    return null;
  }
  return (
    <Badge
      variant="outline"
      className="h-5 px-1.5 text-[10px]"
      title={text}
      data-testid="run-attribution-badge"
    >
      {text}
    </Badge>
  );
}
