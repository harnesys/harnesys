import type { HumanEntry, ThreadAttachment } from '@harnesys/studio-shared';
import { loadThreadAttachment } from '@/shared/api';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { FileChip } from '@/shared/ui/file-chip';
export function MessageAttachments({ entry, threadId }: { entry: HumanEntry; threadId: string }) {
  const attachments = entry.attachments;
  if (!attachments?.length) {
    return null;
  }
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {uniqueAttachments(attachments).map((item: ThreadAttachment) => (
        <AttachmentPreview key={item.id} threadId={threadId} item={item} />
      ))}
    </div>
  );
}
function uniqueAttachments(items: ThreadAttachment[]): ThreadAttachment[] {
  const seen = new Set<string>();
  const out: ThreadAttachment[] = [];
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
function AttachmentPreview({ threadId, item }: { threadId: string; item: ThreadAttachment }) {
  const { url } = useAuthedBlobUrl(() => loadThreadAttachment(threadId, item.id), item.id);
  return <FileChip name={item.name} mediaType={item.mediaType ?? ''} href={url ?? undefined} />;
}
