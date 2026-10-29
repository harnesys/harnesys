import type { PlacementQueueItem } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { placementQueueQuery, placementQueueQueryKey, watchFleetChanged } from '@/shared/api';
import { RowChip } from '@/shared/ui/capability-rows';
import { SettingsSection } from '@/shared/ui/settings-kit';

interface PlacementQueueSectionProps {
  orgId: string;
  profileId: string;
  profileName: string;
}

export function PlacementQueueSection({
  orgId,
  profileId,
  profileName,
}: PlacementQueueSectionProps) {
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery(placementQueueQuery(orgId, profileId));

  useEffect(() => {
    if (!orgId) {
      return;
    }
    return watchFleetChanged(orgId, () => {
      void queryClient.invalidateQueries({ queryKey: placementQueueQueryKey(orgId, profileId) });
    });
  }, [orgId, profileId, queryClient]);

  return (
    <SettingsSection
      label="Waiting runs"
      count={items.length}
      description={profileName}
      testId="fleet-placement-queue"
    >
      {items.length === 0 ? (
        <p className="px-1 text-muted-foreground text-xs">No waiting runs for this profile.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {items.map((item) => (
            <QueueRow key={item.runId} item={item} />
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}

function QueueRow({ item }: { item: PlacementQueueItem }) {
  const ageMin = Math.floor(item.ageMs / 60_000);
  const eligible = item.candidates.filter((candidate) => candidate.eligible);
  return (
    <li className="px-1 py-2.5" data-testid={`fleet-queue-${item.runId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm">
          <span>{item.triggerKind}</span>
          <RowChip>P{item.priority}</RowChip>
          {item.triggerKind === 'issue' ? (
            <RowChip tone="accent">→ P{item.effectivePriority}</RowChip>
          ) : null}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">{ageMin}m waiting</span>
      </div>
      <p className="mt-1 text-muted-foreground text-xs">{item.lastReason}</p>
      <p className="mt-1 text-xs tabular-nums">
        {eligible.length}/{item.candidates.length} eligible
        {item.candidates.length > 0
          ? ` · ${item.candidates
              .slice(0, 4)
              .map((candidate) =>
                candidate.eligible
                  ? candidate.nodeId.slice(0, 8)
                  : `${candidate.nodeId.slice(0, 8)}(${candidate.reasons.join(',')})`,
              )
              .join(', ')}`
          : ''}
      </p>
    </li>
  );
}
