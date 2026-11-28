import {
  parseFileArtifact as parseAttachmentToolArtifact,
  parseLinkArtifact as parseLinkToolArtifact,
} from '@harnesys/studio-shared';
import type { ToolEventPair } from '@/entities/session';
import { openFile } from '@/features/ide';
import { blobContentBackend, type FileRef, fileRefKey } from '@/features/open-file';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { isTextLike } from '@/shared/lib/file-meta';
import { AttachmentTile, useBlobTextPreview } from '@/shared/ui/attachment-tile';
import type { ImageArtifactInfo } from './image-artifact';

export interface FileArtifactInfo {
  key: string;
  ref: FileRef;
  name: string;
  mediaType: string;
  size: number;
}

function attachmentInfo(
  artifact: { attachmentId: string; name: string; mediaType: string; sizeBytes?: number },
  threadId: string,
): FileArtifactInfo {
  const ref: FileRef = {
    source: 'thread-attachment',
    threadId,
    attachmentId: artifact.attachmentId,
    name: artifact.name,
    mediaType: artifact.mediaType,
  };
  return {
    key: fileRefKey(ref),
    ref,
    name: artifact.name,
    mediaType: artifact.mediaType,
    size: artifact.sizeBytes ?? 0,
  };
}

export function parseFileArtifact(pair: ToolEventPair, threadId?: string): FileArtifactInfo | null {
  const artifact = parseAttachmentToolArtifact({
    phase: pair.result?.phase,
    output: pair.result?.output,
  });
  if (!artifact || !threadId) {
    return null;
  }
  return attachmentInfo(artifact, threadId);
}

export function parseLinkFileArtifact(pair: ToolEventPair): FileArtifactInfo | null {
  const artifact = parseLinkToolArtifact({
    phase: pair.result?.phase,
    output: pair.result?.output,
  });
  if (!artifact || artifact.mediaType.startsWith('image/')) {
    return null;
  }
  return linkInfo(artifact);
}

function linkInfo(artifact: ReturnType<typeof parseLinkToolArtifact>): FileArtifactInfo | null {
  if (!artifact) {
    return null;
  }
  const target = artifact.target;
  if (target.source === 'thread' ? !target.threadId : !target.projectId) {
    return null;
  }
  const ref: FileRef =
    target.source === 'thread'
      ? { source: 'thread', threadId: target.threadId ?? '', path: target.path }
      : {
          source: 'project',
          projectId: target.projectId ?? '',
          path: target.path,
          ...(target.worktreeId !== undefined ? { worktreeId: target.worktreeId } : {}),
        };
  return {
    key: fileRefKey(ref),
    ref,
    name: artifact.name,
    mediaType: artifact.mediaType,
    size: artifact.sizeBytes ?? 0,
  };
}

export function parseLinkImageArtifact(pair: ToolEventPair): ImageArtifactInfo | null {
  const artifact = parseLinkToolArtifact({
    phase: pair.result?.phase,
    output: pair.result?.output,
  });
  if (!artifact?.mediaType.startsWith('image/')) {
    return null;
  }
  const info = linkInfo(artifact);
  return info === null ? null : { key: info.key, ref: info.ref, name: info.name, size: info.size };
}

export function FileArtifact({
  fileRef,
  name,
  mediaType,
  size,
}: {
  fileRef: FileRef;
  name: string;
  mediaType: string;
  size: number;
}) {
  const backend = blobContentBackend(fileRef);
  const textLike = isTextLike(name, mediaType);
  const { url, error } = useAuthedBlobUrl(
    textLike ? backend.load : null,
    textLike ? backend.key : '',
  );
  const preview = useBlobTextPreview(url);
  return (
    <AttachmentTile
      name={name}
      mediaType={mediaType}
      bytes={size > 0 ? size : undefined}
      preview={textLike ? preview : null}
      href={url ?? undefined}
      load={backend.load}
      failed={Boolean(error)}
      onOpen={() => openFile(fileRef)}
    />
  );
}
