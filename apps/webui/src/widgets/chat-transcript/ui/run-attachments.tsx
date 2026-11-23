import type { FeedRun } from '@/entities/session';
import { cn } from '@/shared/lib/utils';
import type { FileArtifactInfo } from './file-artifact';
import { FileArtifact, parseFileArtifact } from './file-artifact';
import type { ImageArtifactInfo } from './image-artifact';
import { ImageArtifact, parseImageArtifact } from './image-artifact';

export type RunAttachment =
  | { kind: 'image'; info: ImageArtifactInfo }
  | { kind: 'file'; info: FileArtifactInfo };

export function collectRunAttachments(run: FeedRun): RunAttachment[] {
  const seen = new Set<string>();
  const found: RunAttachment[] = [];
  for (const segment of run.segments) {
    if (segment.kind !== 'activity') {
      continue;
    }
    for (const item of segment.items) {
      if (item.type !== 'group') {
        continue;
      }
      collectChunkAttachments(item.chunks, seen, found);
    }
  }
  return found;
}

function collectChunkAttachments(
  chunks: { type: string; pairs?: unknown }[],
  seen: Set<string>,
  found: RunAttachment[],
): void {
  for (const chunk of chunks) {
    if (chunk.type !== 'tools' || !Array.isArray(chunk.pairs)) {
      continue;
    }
    for (const pair of chunk.pairs) {
      pushPairAttachment(pair, seen, found);
    }
  }
}

function pushPairAttachment(pair: unknown, seen: Set<string>, found: RunAttachment[]): void {
  const image = parseImageArtifact(pair as Parameters<typeof parseImageArtifact>[0]);
  if (image) {
    if (!seen.has(image.attachmentId)) {
      seen.add(image.attachmentId);
      found.push({ kind: 'image', info: image });
    }
    return;
  }
  const file = parseFileArtifact(pair as Parameters<typeof parseFileArtifact>[0]);
  if (file && !seen.has(file.attachmentId)) {
    seen.add(file.attachmentId);
    found.push({ kind: 'file', info: file });
  }
}

function renderAttachment(attachment: RunAttachment, threadId: string) {
  if (attachment.kind === 'image') {
    return (
      <ImageArtifact
        key={attachment.info.attachmentId}
        threadId={threadId}
        attachmentId={attachment.info.attachmentId}
        name={attachment.info.name}
        mediaType={attachment.info.mediaType}
      />
    );
  }
  return (
    <FileArtifact
      key={attachment.info.attachmentId}
      threadId={threadId}
      attachmentId={attachment.info.attachmentId}
      name={attachment.info.name}
      mediaType={attachment.info.mediaType}
      size={attachment.info.size}
    />
  );
}

export function RunAttachments({
  run,
  threadId,
  className,
}: {
  run: FeedRun;
  threadId?: string;
  className?: string;
}) {
  if (!threadId) {
    return null;
  }
  const attachments = collectRunAttachments(run);
  if (attachments.length === 0) {
    return null;
  }
  return (
    <div className={cn('flex flex-wrap items-start gap-2', className)}>
      {attachments.map((attachment) => renderAttachment(attachment, threadId))}
    </div>
  );
}
