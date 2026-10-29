import type { FeedDetailMode } from '@/shared/lib/chat-preferences';

export function isAutoOpen(mode: FeedDetailMode, live: boolean): boolean {
  if (mode === 'full') {
    return true;
  }
  if (mode === 'quiet') {
    return live;
  }
  return false;
}
