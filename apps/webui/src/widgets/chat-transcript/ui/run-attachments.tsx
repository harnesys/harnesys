import type { FeedRun } from '@/entities/session';
import { cn } from '@/shared/lib/utils';
import type { FileArtifactInfo } from './file-artifact';
import {
  FileArtifact,
  parseFileArtifact,
  parseLinkFileArtifact,
  parseLinkImageArtifact,
} from './file-artifact';
import type { ImageArtifactInfo } from './image-artifact';
import { ImageArtifact, parseImageArtifact } from './image-artifact';

export type RunAttachment =
  | { kind: 'image'; info: ImageArtifactInfo }
  | { kind: 'file'; info: FileArtifactInfo };

function pushImage(
  info: ImageArtifactInfo | null,
  seen: Set<string>,
  found: RunAttachment[],
): void {
  if (info !== null && !seen.has(info.key)) {
    seen.add(info.key);
    found.push({ kind: 'image', info });
  }
}

function pushFile(info: FileArtifactInfo | null, seen: Set<string>, found: RunAttachment[]): void {
  if (info !== null && !seen.has(info.key)) {
    seen.add(info.key);
    found.push({ kind: 'file', info });
  }
}

export function collectRunAttachments(run: FeedRun, threadId?: string): RunAttachment[] {
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
      for (const chunk of item.chunks) {
        if (chunk.type !== 'tools' || !Array.isArray(chunk.pairs)) {
          continue;
        }
        for (const pair of chunk.pairs) {
          const view = pair as Parameters<typeof parseImageArtifact>[0];
          pushImage(parseImageArtifact(view, threadId), seen, found);
          pushFile(parseFileArtifact(view, threadId), seen, found);
          pushImage(parseLinkImageArtifact(view), seen, found);
          pushFile(parseLinkFileArtifact(view), seen, found);
        }
      }
    }
  }
  return found;
}

function renderAttachment(attachment: RunAttachment) {
  if (attachment.kind === 'image') {
    return (
      <ImageArtifact
        key={attachment.info.key}
        fileRef={attachment.info.ref}
        name={attachment.info.name}
        size={attachment.info.size}
      />
    );
  }
  return (
    <FileArtifact
      key={attachment.info.key}
      fileRef={attachment.info.ref}
      name={attachment.info.name}
      mediaType={attachment.info.mediaType}
      size={attachment.info.size}
    />
  );
}

export function RunAttachments({
  run,
  threadId,
  live = false,
  className,
}: {
  run: FeedRun;
  threadId?: string;
  live?: boolean;
  className?: string;
}) {
  const attachments = live ? [] : collectRunAttachments(run, threadId);
  if (attachments.length === 0) {
    return null;
  }
  return (
    <div className={cn('flex flex-wrap items-start gap-2', className)}>
      {attachments.map(renderAttachment)}
    </div>
  );
}
