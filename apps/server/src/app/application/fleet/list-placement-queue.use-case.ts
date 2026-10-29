import { Injectable } from '@harnesys/brix';
import type {
  PlacementQueueCandidate,
  PlacementQueueItem,
  PlacementQueueResponse,
} from '@harnesys/contracts';
import { PendingPlacementPort } from '../../domain/fleet/pending-placement.port.ts';
import {
  effectivePriority,
  type PendingPlacement,
  sortPendingPlacements,
} from '../../domain/fleet/pending-placement.ts';

export interface ListPlacementQueueRequest {
  orgId: string;
  profileId?: string;
}

@Injectable()
export class ListPlacementQueueUseCase {
  constructor(private readonly pending: PendingPlacementPort) {}

  execute(request: ListPlacementQueueRequest): PlacementQueueResponse {
    const nowMs = Date.now();
    const rows = request.profileId
      ? this.pending.listByProfile(request.orgId, request.profileId)
      : this.pending.listByOrg(request.orgId);
    const items = sortPendingPlacements(rows, nowMs).map((row) => toItem(row, nowMs));
    return { items };
  }
}

function toItem(row: PendingPlacement, nowMs: number): PlacementQueueItem {
  return {
    runId: row.runId,
    threadId: row.threadId,
    profileId: row.profileId,
    createdAt: row.createdAt,
    ageMs: Math.max(0, nowMs - Date.parse(row.createdAt)),
    priority: row.priority,
    effectivePriority: issueEffectivePriority(row, nowMs),
    triggerKind: row.trigger.kind,
    triggerId: row.trigger.id,
    lastReason: row.lastReason,
    attempt: row.attempt,
    expiresAt: row.expiresAt,
    candidates: parseCandidates(row.lastCandidatesJson),
  };
}

function issueEffectivePriority(row: PendingPlacement, nowMs: number): number {
  if (row.trigger.kind === 'issue') {
    return effectivePriority(row.priority, row.createdAt, nowMs);
  }
  return row.priority;
}

function parseCandidates(raw: string): PlacementQueueCandidate[] {
  try {
    const parsed = JSON.parse(raw) as PlacementQueueCandidate[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => ({
      nodeId: String(item.nodeId),
      eligible: Boolean(item.eligible),
      reasons: Array.isArray(item.reasons) ? item.reasons.map(String) : [],
      activeClaims: typeof item.activeClaims === 'number' ? item.activeClaims : 0,
    }));
  } catch {
    return [];
  }
}
