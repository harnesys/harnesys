import type { Thread } from '@/entities/thread';
import { ThreadSettings } from '@/features/manage-thread-members';

export function ComposerThreadMenu({ thread }: { thread?: Thread | null }) {
  if (!thread) {
    return null;
  }
  return <ThreadSettings thread={thread} />;
}
