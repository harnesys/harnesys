import { describe, expect, test } from 'bun:test';
import { shouldShowPlacementInFeed } from './placement-visibility.ts';

describe('shouldShowPlacementInFeed', () => {
  test('hides repeated local success', () => {
    expect(
      shouldShowPlacementInFeed({
        selectedNodeId: 'local-host',
        localHostId: 'local-host',
        lastSelectedNodeId: null,
      }),
    ).toBe(false);
    expect(
      shouldShowPlacementInFeed({
        selectedNodeId: 'local-host',
        localHostId: 'local-host',
        lastSelectedNodeId: 'local-host',
      }),
    ).toBe(false);
  });

  test('shows unavailable, remote, and host change', () => {
    expect(
      shouldShowPlacementInFeed({
        selectedNodeId: null,
        localHostId: 'local-host',
        lastSelectedNodeId: 'local-host',
      }),
    ).toBe(true);
    expect(
      shouldShowPlacementInFeed({
        selectedNodeId: 'worker-b',
        localHostId: 'local-host',
        lastSelectedNodeId: 'local-host',
      }),
    ).toBe(true);
    expect(
      shouldShowPlacementInFeed({
        selectedNodeId: 'local-host',
        localHostId: 'local-host',
        lastSelectedNodeId: 'worker-b',
      }),
    ).toBe(true);
  });
});
