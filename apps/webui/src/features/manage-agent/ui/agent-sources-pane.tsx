import type { AgentSourceLevel } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { fleetNodesQuery } from '@/shared/api';
import { listSources } from '@/shared/api/sources';
import { Row, RowList } from '@/shared/ui/capability-rows';
import { FolderTypeIcon } from '@/shared/ui/icons';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

interface AgentSourcesPaneProps {
  orgId: string;
  value: string[];
  levels: Record<string, AgentSourceLevel>;
  onChange: (next: string[]) => void;
  onLevelsChange: (next: Record<string, AgentSourceLevel>) => void;
}

export function AgentSourcesPane({
  orgId,
  value,
  levels,
  onChange,
  onLevelsChange,
}: AgentSourcesPaneProps) {
  const sourcesQuery = useQuery({
    queryKey: ['sources', orgId],
    queryFn: () => listSources(orgId),
    enabled: Boolean(orgId),
  });
  const { data: nodes = [] } = useQuery(fleetNodesQuery);
  const nodeNames = Object.fromEntries(nodes.map((node) => [node.id, node.name]));
  const sources = (sourcesQuery.data?.sources ?? []).filter((source) => !source.managed);

  function applyLevel(sourceId: string, level: AgentSourceLevel | null) {
    if (level === null) {
      onChange(value.filter((id) => id !== sourceId));
      return;
    }
    onChange(value.includes(sourceId) ? value : [...value, sourceId]);
    if (levels[sourceId] !== level) {
      onLevelsChange({ ...levels, [sourceId]: level });
    }
  }

  return (
    <RowList testId="agent-sources-pane">
      <p className="px-1 py-2 text-muted-foreground text-xs">
        All agents can work in the org workspace.
      </p>
      {sources.length === 0 ? (
        <p className="px-1 py-2 text-muted-foreground text-sm">
          No sources in this project yet. Attach a folder or repository first.
        </p>
      ) : null}
      {sources.map((source) => {
        const hostLabel =
          source.distribution.kind === 'host-bound'
            ? (nodeNames[source.distribution.hostId] ?? source.distribution.hostId)
            : 'Cloud drive';
        const shared = value.includes(source.id);
        const level: AgentSourceLevel | 'none' = shared ? (levels[source.id] ?? 'edit') : 'none';
        return (
          <Row
            key={source.id}
            icon={<FolderTypeIcon size="sm" />}
            title={source.name}
            meta={hostLabel}
            mono={false}
            muted={!shared}
            summary={source.description}
            actions={
              <ToggleGroup
                variant="segment"
                value={[level]}
                onValueChange={(next) => {
                  const picked = next[next.length - 1];
                  if (picked === 'none') {
                    applyLevel(source.id, null);
                  } else if (picked === 'read' || picked === 'edit') {
                    applyLevel(source.id, picked);
                  }
                }}
              >
                <ToggleGroupItem value="none" aria-label={`No access to ${source.name}`}>
                  —
                </ToggleGroupItem>
                <ToggleGroupItem value="read" aria-label={`Read access to ${source.name}`}>
                  Read
                </ToggleGroupItem>
                <ToggleGroupItem value="edit" aria-label={`Edit access to ${source.name}`}>
                  Edit
                </ToggleGroupItem>
              </ToggleGroup>
            }
            alwaysShowActions
          />
        );
      })}
    </RowList>
  );
}
