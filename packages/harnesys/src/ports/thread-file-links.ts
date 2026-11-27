import type { AttachmentKind } from '../domain/attachment.ts';
import type { CapabilityScope } from '../domain/pack.ts';

export interface ThreadFileLinkInput {
  path: string;
}

export interface ThreadDirLinkTarget {
  source: 'thread';
  threadId: string;
  path: string;
}

export interface ProjectLinkTarget {
  source: 'project';
  projectId: string;
  path: string;
  worktreeId?: string;
}

export type ThreadFileLinkTarget = ThreadDirLinkTarget | ProjectLinkTarget;

export interface ThreadFileLinkMeta {
  name: string;
  mediaType: string;
  kind: AttachmentKind;
  sizeBytes: number;
}

export type ThreadFileLinkRecord = ThreadFileLinkTarget & ThreadFileLinkMeta;

export abstract class ThreadFileLinkPort {
  abstract link(scope: CapabilityScope, input: ThreadFileLinkInput): Promise<ThreadFileLinkRecord>;
}
