import type { EventsWatchResyncFrame, EventsWatchResyncReason } from '@harnesys/studio-shared';
import type { EventsWatchFrame } from '../../domain/events-watch/events-watch-frame.ts';

export type { EventsWatchFrame } from '../../domain/events-watch/events-watch-frame.ts';
export { KEEP_ALIVE_FRAME, serializeFrame } from '../../domain/events-watch/events-watch-frame.ts';

export const RESYNC_TOPIC = 'resync';

export function buildResyncFrame(
  orgId: string,
  latestSeq: number,
  reason: EventsWatchResyncReason,
): EventsWatchFrame {
  const payload: EventsWatchResyncFrame = { orgId, latestSeq, reason };
  return { seq: latestSeq, topic: RESYNC_TOPIC, data: JSON.stringify(payload) };
}
