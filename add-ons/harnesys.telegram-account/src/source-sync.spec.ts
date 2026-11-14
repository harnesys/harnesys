import { describe, expect, test } from 'bun:test';
import { channelsMarkOf, syncSourcesOnDemand } from './source-sync.ts';

describe('source sync marker', () => {
  test('ignores order, case and duplicates in the channel list', () => {
    expect(channelsMarkOf(['@beta', '@Alpha', '4334557990'])).toBe(
      channelsMarkOf(['4334557990', '@alpha', '@BETA', '@alpha ']),
    );
    expect(channelsMarkOf(['@alpha'])).not.toBe(channelsMarkOf(['@alpha', '@beta']));
    expect(channelsMarkOf([])).toBe('[]');
  });

  test('skips the sync when the marker matches and reruns when it does not', async () => {
    let syncs = 0;
    let marker: string | null = channelsMarkOf(['@alpha']);
    const deps = {
      sync: async () => {
        syncs += 1;
      },
      readMarker: async () => marker,
      writeMarker: async (mark: string) => {
        marker = mark;
      },
    };

    expect(await syncSourcesOnDemand(['@ALPHA'], deps)).toBe(false);
    expect(syncs).toBe(0);

    expect(await syncSourcesOnDemand(['@alpha', '@beta'], deps)).toBe(true);
    expect(syncs).toBe(1);
    expect(marker).toBe(channelsMarkOf(['@beta', '@alpha']));

    expect(await syncSourcesOnDemand(['@alpha', '@beta'], deps)).toBe(false);
    expect(syncs).toBe(1);

    const failing = {
      sync: async () => {
        throw new Error('boom');
      },
      readMarker: async () => null,
      writeMarker: async () => {
        throw new Error('marker must not be written after a failed sync');
      },
    };
    await expect(syncSourcesOnDemand(['@alpha'], failing)).rejects.toThrow('boom');
  });
});
