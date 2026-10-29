import type { OrgExecutionSnapshot, SourceDistribution } from '@harnesys/contracts';
import type { SourceRecord } from '../../domain/source/source-registry.port.ts';
import { boundHostId } from '../../domain/source/ui-visibility.policy.ts';
import { createSnapshotSourceRegistry } from '../fleet-hub/snapshot-registry.ts';

export interface ContentRouteTarget {
  hostId: string;
  remote: boolean;
}

export function findSourceForContentRoute(input: {
  orgId: string;
  sourceId: string;
  local: SourceRecord | null;
  snapshot: OrgExecutionSnapshot | null;
}): SourceRecord | null {
  if (input.local) {
    return input.local;
  }
  if (!input.snapshot) {
    return null;
  }
  return createSnapshotSourceRegistry(input.snapshot).findById(input.orgId, input.sourceId);
}

export function contentRouteTarget(input: {
  localHostId: string;
  distribution: SourceDistribution;
  readyHostIds?: readonly string[];
}): ContentRouteTarget {
  const bound = boundHostId(input.distribution);
  if (bound) {
    return { hostId: bound, remote: bound !== input.localHostId };
  }
  const ready = input.readyHostIds ?? [];
  if (ready.includes(input.localHostId)) {
    return { hostId: input.localHostId, remote: false };
  }
  const remoteReady = ready.find((hostId) => hostId !== input.localHostId);
  if (remoteReady) {
    return { hostId: remoteReady, remote: true };
  }
  return { hostId: input.localHostId, remote: false };
}

export function readyContentHostIds(input: {
  localReady: boolean;
  localHostId: string;
  projectionReadyHostIds: readonly string[];
  materializationReadyHostIds: readonly string[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (hostId: string) => {
    if (seen.has(hostId)) {
      return;
    }
    seen.add(hostId);
    out.push(hostId);
  };
  if (input.localReady) {
    push(input.localHostId);
  }
  for (const hostId of input.projectionReadyHostIds) {
    push(hostId);
  }
  for (const hostId of input.materializationReadyHostIds) {
    push(hostId);
  }
  return out;
}
