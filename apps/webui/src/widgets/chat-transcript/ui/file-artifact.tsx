import {
  parseFileArtifact as parseAttachmentToolArtifact,
  parseLinkArtifact as parseLinkToolArtifact,
} from '@harnesys/studio-shared';
import { DownloadIcon } from 'lucide-react';
import type { ToolEventPair } from '@/entities/session';
import { openFile } from '@/features/ide';
import { blobContentBackend, type FileRef, fileRefKey } from '@/features/open-file';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { cn } from '@/shared/lib/utils';
import { FileTypeIcon } from '@/shared/ui/icons';
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
  return info === null ? null : { key: info.key, ref: info.ref, name: info.name };
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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
  const { url, error } = useAuthedBlobUrl(backend.load, backend.key);
  if (error) {
    return <div className="text-muted-foreground text-xs">Failed to load file</div>;
  }
  if (!url) {
    return <div className="h-9 w-72 max-w-full animate-pulse rounded-lg border bg-muted/40" />;
  }
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title={`${mediaType} · ${formatBytes(size)}`}
        onClick={() => openFile(fileRef)}
        className={cn(
          'inline-flex h-9 max-w-md items-center gap-2 rounded-lg border px-2.5',
          'bg-muted/30 text-foreground transition-colors hover:bg-muted/60',
        )}
      >
        <FileTypeIcon name={name} mediaType={mediaType} size="sm" />
        <span className="truncate font-mono text-[11px]">{name}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{formatBytes(size)}</span>
      </button>
      <a
        href={url}
        download={name}
        title="Download"
        className={cn(
          'inline-flex size-7 shrink-0 items-center justify-center rounded-lg border',
          'text-muted-foreground transition-colors hover:text-foreground',
        )}
      >
        <DownloadIcon className="size-3.5" />
      </a>
    </div>
  );
}
