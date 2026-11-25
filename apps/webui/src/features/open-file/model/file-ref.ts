export interface ProjectFileRef {
  source: 'project';
  projectId: string;
  path: string;
  worktreeId?: string;
  worktreeBranch?: string;
}
export interface ThreadSandboxFileRef {
  source: 'thread-sandbox';
  threadId: string;
  path: string;
}
export interface ThreadAttachmentFileRef {
  source: 'thread-attachment';
  threadId: string;
  attachmentId: string;
  name: string;
  mediaType: string;
}
export interface IssueAttachmentFileRef {
  source: 'issue-attachment';
  issueId: string;
  attachmentId: string;
  name: string;
  mediaType: string;
  projectId?: string;
}
export type FileRef =
  | ProjectFileRef
  | ThreadSandboxFileRef
  | ThreadAttachmentFileRef
  | IssueAttachmentFileRef;

export function fileRefPath(ref: FileRef): string {
  return ref.source === 'project' || ref.source === 'thread-sandbox' ? ref.path : ref.name;
}

export function fileRefKey(ref: FileRef): string {
  if (ref.source === 'project') {
    const path = ref.path.replace(/^\/+/, '');
    return ref.worktreeId ? `wt:${ref.worktreeId}:${path}` : path;
  }
  if (ref.source === 'thread-sandbox') {
    return `thread:${ref.threadId}:${ref.path.replace(/^\/+/, '')}`;
  }
  if (ref.source === 'thread-attachment') {
    return `thread-att:${ref.threadId}:${ref.attachmentId}`;
  }
  return `issue-att:${ref.issueId}:${ref.attachmentId}`;
}

export function fileRefProjectId(ref: FileRef, fallback: string): string {
  if (ref.source === 'project') {
    return ref.projectId;
  }
  if (ref.source === 'issue-attachment') {
    return ref.projectId ?? fallback;
  }
  return fallback;
}

export function isWritableFileRef(ref: FileRef): boolean {
  return ref.source === 'project' || ref.source === 'thread-sandbox';
}

export function isProjectFileRef(ref: FileRef): ref is ProjectFileRef {
  return ref.source === 'project';
}
