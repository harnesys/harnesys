import type { ThreadKind } from '@harnesys/contracts';
import type { ThreadPatch } from '../../domain/thread/thread.ts';

export interface ThreadPatchUpdates {
  title?: string;
  kind?: ThreadKind;
  autoReplyAgentId?: string | null;
  policy?: string;
  metadata?: string;
  issueId?: string | null;
  runProfileId?: string | null;
  runDirectory?: string | null;
  lastReadAt?: string;
  updatedAt: string;
}

export function threadPatchUpdates(patch: ThreadPatch): ThreadPatchUpdates {
  const updates: ThreadPatchUpdates = { updatedAt: new Date().toISOString() };
  if (patch.title !== undefined) {
    updates.title = patch.title;
  }
  if (patch.kind !== undefined) {
    updates.kind = patch.kind;
  }
  if (patch.autoReplyAgentId !== undefined) {
    updates.autoReplyAgentId = patch.autoReplyAgentId;
  }
  if (patch.policy !== undefined) {
    updates.policy = JSON.stringify(patch.policy);
  }
  if (patch.metadata !== undefined) {
    updates.metadata = JSON.stringify(patch.metadata);
  }
  if (patch.issueId !== undefined) {
    updates.issueId = patch.issueId;
  }
  if (patch.runProfileId !== undefined) {
    updates.runProfileId = patch.runProfileId;
  }
  if (patch.runDirectory !== undefined) {
    updates.runDirectory = patch.runDirectory;
  }
  if (patch.lastReadAt !== undefined) {
    updates.lastReadAt = patch.lastReadAt;
  }
  return updates;
}
