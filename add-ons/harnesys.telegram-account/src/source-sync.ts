import type { AddonContext } from '@harnesys/sdk';
import { syncSourcesOnce } from './feed-worker.ts';
import { channelsOf } from './filter.ts';
import { readState, writeState } from './state-store.ts';

export const SOURCES_SYNCED_KEY = 'sources_synced';

export function channelsMarkOf(channels: readonly string[]): string {
  const normalized = [...new Set(channels.map((entry) => entry.trim().toLowerCase()))]
    .filter((entry) => entry.length > 0)
    .sort();
  return JSON.stringify(normalized);
}

export interface SourceSyncDeps {
  sync(): Promise<void>;
  readMarker(): Promise<string | null>;
  writeMarker(mark: string): Promise<void>;
}

export async function syncSourcesOnDemand(
  channels: readonly string[],
  deps: SourceSyncDeps,
): Promise<boolean> {
  const mark = channelsMarkOf(channels);
  if ((await deps.readMarker()) === mark) {
    return false;
  }
  await deps.sync();
  await deps.writeMarker(mark);
  return true;
}

export async function syncSourcesIfStale(ctx: AddonContext): Promise<void> {
  const channels = channelsOf(await ctx.config.get(['channels']));
  try {
    await syncSourcesOnDemand(channels, {
      sync: () => syncSourcesOnce(ctx),
      readMarker: () => readState(ctx, SOURCES_SYNCED_KEY),
      writeMarker: (mark) => writeState(ctx, SOURCES_SYNCED_KEY, mark),
    });
  } catch (error) {
    await ctx.log.warn('telegram account source sync failed', {
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
