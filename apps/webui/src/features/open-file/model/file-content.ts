import {
  loadIssueAttachment,
  loadThreadAttachment,
  loadThreadFileContent,
  readThreadFileText,
  threadAttachmentQueryKey,
  threadFileQueryKey,
  writeThreadFileContent,
} from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import {
  loadProjectFileBlob,
  readProjectFileText,
  sourceFileContentQueryKey,
  writeProjectFileContent,
} from '@/shared/api/files';
import { type OpenFileKind, openFileKind } from './file-kind';
import { type FileRef, fileRefPath } from './file-ref';

export interface TextContentBackend {
  key: string;
  queryKey: readonly unknown[];
  read: () => Promise<string>;
  write: (content: string) => Promise<void>;
}

export interface BlobContentBackend {
  key: string;
  load: () => Promise<Blob>;
}

export function textContentBackend(ref: FileRef): TextContentBackend | null {
  if (ref.source === 'project') {
    return {
      key: ref.worktreeId ? `${ref.worktreeId}:${ref.path}` : ref.path,
      queryKey: sourceFileContentQueryKey(ref.projectId, ref.path, ref.worktreeId),
      read: () => readProjectFileText(ref.projectId, ref.path, ref.worktreeId),
      write: async (content) => {
        await writeProjectFileContent(ref.projectId, {
          path: ref.path,
          content,
          ...(ref.worktreeId ? { worktreeId: ref.worktreeId } : {}),
        });
      },
    };
  }
  if (ref.source === 'thread-sandbox') {
    return {
      key: `thread:${ref.threadId}:${ref.path}`,
      queryKey: threadFileQueryKey(ref.threadId, ref.path),
      read: () => readThreadFileText(ref.threadId, ref.path),
      write: async (content) => {
        await writeThreadFileContent(ref.threadId, ref.path, content);
      },
    };
  }
  return null;
}

export function blobContentBackend(ref: FileRef): BlobContentBackend {
  if (ref.source === 'project') {
    return {
      key: `${ref.projectId}:${ref.path}:${ref.worktreeId ?? ''}`,
      load: () => loadProjectFileBlob(ref.projectId, ref.path, ref.worktreeId),
    };
  }
  if (ref.source === 'thread-sandbox') {
    return {
      key: threadFileQueryKey(ref.threadId, ref.path).join(':'),
      load: () => loadThreadFileContent(ref.threadId, ref.path),
    };
  }
  if (ref.source === 'thread-attachment') {
    return {
      key: threadAttachmentQueryKey(ref.threadId, ref.attachmentId).join(':'),
      load: () => loadThreadAttachment(ref.threadId, ref.attachmentId),
    };
  }
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new Error('active org required');
  }
  return {
    key: `issue-att:${ref.issueId}:${ref.attachmentId}`,
    load: () => loadIssueAttachment(orgId, ref.issueId, ref.attachmentId),
  };
}

export function fileRefKind(ref: FileRef): OpenFileKind {
  if (ref.source === 'thread-attachment' || ref.source === 'issue-attachment') {
    return kindFromMediaType(ref.mediaType, ref.name);
  }
  return openFileKind(fileRefPath(ref));
}

export function isEditableFileRef(ref: FileRef): boolean {
  return textContentBackend(ref) !== null && fileRefKind(ref) === 'text';
}

function kindFromMediaType(mediaType: string, name: string): OpenFileKind {
  if (mediaType.startsWith('image/')) {
    return 'image';
  }
  if (mediaType.startsWith('video/')) {
    return 'video';
  }
  if (mediaType.startsWith('audio/')) {
    return 'audio';
  }
  if (mediaType === 'application/pdf') {
    return 'pdf';
  }
  if (mediaType === 'text/csv') {
    return 'csv';
  }
  const byName = openFileKind(name);
  return byName === 'text' ? 'text' : byName;
}
