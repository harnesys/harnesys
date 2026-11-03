import { loadThreadAttachment } from '@/shared/api';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { FileChip } from '@/shared/ui/file-chip';

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

export function AttachmentPreview({
  threadId,
  item,
}: {
  threadId: string;
  item: {
    id: string;
    kind: string;
    name: string;
    mediaType: string;
    path: string;
  };
}) {
  const { url } = useAuthedBlobUrl(() => loadThreadAttachment(threadId, item.id), item.id);
  if (item.kind === 'audio') {
    return (
      <audio controls src={url ?? undefined} className="h-9 max-w-64">
        <track kind="captions" />
      </audio>
    );
  }
  if (item.kind === 'video') {
    return (
      <video controls src={url ?? undefined} className="max-h-48 max-w-64 rounded-xl">
        <track kind="captions" />
      </video>
    );
  }
  return <FileChip name={item.name} mediaType={item.mediaType ?? ''} href={url ?? undefined} />;
}
