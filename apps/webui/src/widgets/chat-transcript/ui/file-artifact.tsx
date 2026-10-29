import { DownloadIcon } from 'lucide-react';
import type { ToolEventPair } from '@/entities/session';
import { loadThreadAttachment } from '@/shared/api';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { cn } from '@/shared/lib/utils';
import { FileTypeIcon } from '@/shared/ui/icons';
import { asObject, num, parseJson, str } from '../model/tool-json';

export interface FileArtifactInfo {
  attachmentId: string;
  name: string;
  mediaType: string;
  size: number;
}

export function parseFileArtifact(pair: ToolEventPair): FileArtifactInfo | null {
  const result = pair.result;
  if (result?.phase !== 'completed' || pair.call.name !== 'gmail_download_attachment') {
    return null;
  }
  const output = typeof result.output === 'string' ? parseJson(result.output) : result.output;
  const obj = asObject(output);
  const attachmentId = str(obj, 'attachmentId');
  const mediaType = str(obj, 'mediaType');
  if (!obj || !attachmentId || !mediaType) {
    return null;
  }
  return {
    attachmentId,
    name: str(obj, 'filename') ?? attachmentId,
    mediaType,
    size: num(obj, 'size') ?? 0,
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
    <a
      href={url}
      download={name}
      title={`${mediaType} · ${formatBytes(size)} · click to download`}
      className={cn(
        'inline-flex h-9 max-w-md items-center gap-2 rounded-lg border px-2.5',
        'bg-muted/30 text-foreground transition-colors hover:bg-muted/60',
      )}
    >
      <FileTypeIcon name={name} mediaType={mediaType} size="sm" />
      <span className="truncate font-mono text-[11px]">{name}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{formatBytes(size)}</span>
      <DownloadIcon className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}
