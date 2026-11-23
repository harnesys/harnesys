import type { WorkspaceRef } from '@harnesys/contracts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { parseThreadPolicy } from '../../domain/thread/thread-policy.ts';
import type { ThreadRow } from '../org-sqlite/schema/index.ts';
import { mapLegacyDirectory, parseWorkspaceRef, type SourceRoot } from './legacy-workspace-ref.ts';

export function toThread(row: ThreadRow, sourceRoots: SourceRoot[]): ThreadRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    title: row.title,
    kind: row.kind,
    autoReplyAgentId: row.autoReplyAgentId ?? null,
    policy: parseThreadPolicy(row.policy),
    lastThreadSeq: Number(row.lastThreadSeq ?? 0),
    conversationCount: Number(row.conversationCount ?? 0),
    parentThreadId: row.parentThreadId ?? null,
    forkAt: row.forkAt ?? null,
    inheritedEventCount: Number(row.inheritedEventCount ?? '0'),
    metadata: parseMetadata(row.metadata),
    issueId: row.issueId ?? null,
    runProfileId: row.runProfileId ?? null,
    runDirectory: row.runDirectory ?? null,
    workspaceRef: workspaceRefOf(row, sourceRoots),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastReadAt: row.lastReadAt || row.updatedAt,
  };
}

function workspaceRefOf(row: ThreadRow, sourceRoots: SourceRoot[]): WorkspaceRef | null {
  const stored = parseWorkspaceRef(row.workspaceRef);
  if (stored !== null) {
    return stored;
  }
  if (row.runDirectory === null || row.runDirectory.length === 0) {
    return null;
  }
  return mapLegacyDirectory({ runDirectory: row.runDirectory, sourceRoots });
}

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}
