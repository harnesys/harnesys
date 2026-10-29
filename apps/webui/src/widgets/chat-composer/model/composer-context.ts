import type { SessionEvent } from '@harnesys/studio-shared';
import { type MessageUsage, rollupUsage, type UsageRollup } from '@/entities/session';
import {
  fillUsageWindow,
  generationUsages,
  lastModelStats,
  turnGenerationUsages,
} from './model-context';

export interface ComposerUsage {
  last: MessageUsage | null;
  run: UsageRollup;
  thread: UsageRollup;
  stats: ReturnType<typeof lastModelStats>;
}
export function composerUsage(events: SessionEvent[], contextWindow: number): ComposerUsage {
  const usages = generationUsages(events);
  const run = rollupUsage(turnGenerationUsages(events));
  return {
    last: fillUsageWindow(usages.at(-1) ?? null, contextWindow),
    run,
    thread: rollupUsage(usages),
    stats: lastModelStats(events),
  };
}
