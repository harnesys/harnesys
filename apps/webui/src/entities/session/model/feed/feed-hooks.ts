import { useSessionStore } from '../session.store';
import type { MapInfo, SpawnInfo, ThreadFeed } from './feed-types';

const EMPTY_SPAWNS: SpawnInfo[] = [];

export function useThreadFeed(threadId: string | null): ThreadFeed | undefined {
  return useSessionStore((state) => (threadId ? state.feeds[threadId] : undefined));
}

export function useFeedSpawn(threadId: string | null, spawnId: string): SpawnInfo | undefined {
  return useSessionStore((state) => {
    const feed = threadId ? state.feeds[threadId] : undefined;
    return feed?.spawns.find((spawn) => spawn.spawnId === spawnId);
  });
}

export function useFeedSpawns(threadId: string | null): SpawnInfo[] {
  return useSessionStore((state) => {
    const feed = threadId ? state.feeds[threadId] : undefined;
    return feed?.spawns ?? EMPTY_SPAWNS;
  });
}

export function useFeedMap(threadId: string | null, toolCallId: string): MapInfo | undefined {
  return useSessionStore((state) => {
    const feed = threadId ? state.feeds[threadId] : undefined;
    return feed?.maps.find((map) => map.toolCallId === toolCallId);
  });
}
