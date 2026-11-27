import type { HumanEntry } from '@harnesys/studio-shared';
import { AttachmentPreview, uniqueAttachments } from './user-attachments';

export function MessageAttachments({ entry, threadId }: { entry: HumanEntry; threadId: string }) {
  const attachments = entry.attachments;
  if (!attachments?.length) {
    return null;
  }
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {uniqueAttachments(attachments).map((item) => (
        <AttachmentPreview key={item.id} threadId={threadId} item={item} />
      ))}
    </div>
  );
}
