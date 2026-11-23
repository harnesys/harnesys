import type { SessionEvent } from '@harnesys/studio-shared';
import { coalesceStreamDeltas } from './coalesce-events';

export function normalizeThreadEvents(events: SessionEvent[]): SessionEvent[] {
  const coalesced = coalesceStreamDeltas(events);
  let lastStats = -1;
  for (let index = coalesced.length - 1; index >= 0; index -= 1) {
    if (coalesced[index]?.type === 'model.stats') {
      lastStats = index;
      break;
    }
  }
  if (lastStats === -1) {
    return coalesced;
  }
  return coalesced.filter((event, index) => event.type !== 'model.stats' || index === lastStats);
}
