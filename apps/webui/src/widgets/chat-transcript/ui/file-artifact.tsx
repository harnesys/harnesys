import { parseFileArtifact as parseFileToolArtifact } from '@harnesys/studio-shared';
import { DownloadIcon } from 'lucide-react';
import type { ToolEventPair } from '@/entities/session';
import { openThreadFileTab } from '@/features/ide';
import { loadThreadAttachment } from '@/shared/api';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { cn } from '@/shared/lib/utils';
import { FileTypeIcon } from '@/shared/ui/icons';

export interface FileArtifactInfo {
  attachmentId: string;
  name: string;
  mediaType: string;
  size: number;
}

export function parseFileArtifact(pair: ToolEventPair): FileArtifactInfo | null {
  const artifact = parseFileToolArtifact({
    name: pair.call.name,
    phase: pair.result?.phase,
    output: pair.result?.output,
  });
  if (!artifact) {
    return null;
  }
  return {
    attachmentId: artifact.attachmentId,
    name: artifact.name,
    mediaType: artifact.mediaType,
    size: artifact.sizeBytes ?? 0,
  };
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
  threadId,
  attachmentId,
  name,
  mediaType,
  size,
}: {
  threadId: string;
  attachmentId: string;
  name: string;
  mediaType: string;
  size: number;
}) {
  const { url, error } = useAuthedBlobUrl(
    () => loadThreadAttachment(threadId, attachmentId),
    `${threadId}:${attachmentId}`,
  );
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
        onClick={() => openThreadFileTab(threadId, name, attachmentId, mediaType)}
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
