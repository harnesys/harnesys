import { openFile } from '@/features/ide';
import type { FileRef } from '@/features/open-file';
import { loadThreadAttachment } from '@/shared/api';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { isTextLike } from '@/shared/lib/file-meta';
import { AttachmentTile, useBlobTextPreview } from '@/shared/ui/attachment-tile';

export interface AttachmentPreviewItem {
  id: string;
  kind: string;
  name: string;
  mediaType: string;
  path: string;
  sizeBytes?: number;
}

export function uniqueAttachments<
  T extends {
    id: string;
    path: string;
  },
>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.path || item.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

function attachmentFileRef(threadId: string, item: AttachmentPreviewItem): FileRef {
  return {
    source: 'thread-attachment',
    threadId,
    attachmentId: item.id,
    name: item.name,
    mediaType: item.mediaType ?? '',
  };
}

function ImageTile({ threadId, item }: { threadId: string; item: AttachmentPreviewItem }) {
  const { url } = useAuthedBlobUrl(() => loadThreadAttachment(threadId, item.id), item.id);
  return (
    <AttachmentTile
      name={item.name}
      mediaType={item.mediaType ?? ''}
      bytes={item.sizeBytes}
      thumb={url}
      href={url ?? undefined}
      load={() => loadThreadAttachment(threadId, item.id)}
      onOpen={() => openFile(attachmentFileRef(threadId, item))}
    />
  );
}

function TextTile({ threadId, item }: { threadId: string; item: AttachmentPreviewItem }) {
  const { url } = useAuthedBlobUrl(() => loadThreadAttachment(threadId, item.id), item.id);
  const preview = useBlobTextPreview(url);
  return (
    <AttachmentTile
      name={item.name}
      mediaType={item.mediaType ?? ''}
      bytes={item.sizeBytes}
      preview={preview}
      href={url ?? undefined}
      load={() => loadThreadAttachment(threadId, item.id)}
      onOpen={() => openFile(attachmentFileRef(threadId, item))}
    />
  );
}

function PlainTile({ threadId, item }: { threadId: string; item: AttachmentPreviewItem }) {
  return (
    <AttachmentTile
      name={item.name}
      mediaType={item.mediaType ?? ''}
      bytes={item.sizeBytes}
      load={() => loadThreadAttachment(threadId, item.id)}
      onOpen={() => openFile(attachmentFileRef(threadId, item))}
    />
  );
}

export function AttachmentPreview({
  threadId,
  item,
}: {
  threadId: string;
  item: AttachmentPreviewItem;
}) {
  if (item.kind === 'image') {
    return <ImageTile threadId={threadId} item={item} />;
  }
  if (isTextLike(item.name, item.mediaType ?? '')) {
    return <TextTile threadId={threadId} item={item} />;
  }
  return <PlainTile threadId={threadId} item={item} />;
}
