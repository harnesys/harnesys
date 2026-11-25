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
  subagents: UsageRollup;
  stats: ReturnType<typeof lastModelStats>;
}

function nestedRunIds(events: SessionEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (
      event.type === 'agent.spawned' ||
      event.type === 'agent.completed' ||
      event.type === 'agent.failed'
    ) {
      ids.add(event.spawnId);
    } else if (
      event.type === 'map.item.started' ||
      event.type === 'map.item.completed' ||
      event.type === 'map.item.failed'
    ) {
      ids.add(event.workerId);
    }
  }
  return ids;
}

function partitionEvents(events: SessionEvent[]): {
  root: SessionEvent[];
  nested: SessionEvent[];
} {
  const nestedIds = nestedRunIds(events);
  const root: SessionEvent[] = [];
  const nested: SessionEvent[] = [];
  for (const event of events) {
    if (event.runId !== undefined && nestedIds.has(event.runId)) {
      nested.push(event);
    } else {
      root.push(event);
    }
  }
  return { root, nested };
}

export function composerUsage(events: SessionEvent[], contextWindow: number): ComposerUsage {
  const { root, nested } = partitionEvents(events);
  const rootUsages = generationUsages(root);
  return {
    last: fillUsageWindow(rootUsages.at(-1) ?? null, contextWindow),
    run: rollupUsage(turnGenerationUsages(root)),
    thread: rollupUsage(rootUsages),
    subagents: rollupUsage(generationUsages(nested)),
    stats: lastModelStats(root),
  };
}
