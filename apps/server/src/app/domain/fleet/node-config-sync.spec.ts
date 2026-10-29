import { describe, expect, test } from 'bun:test';
import { resolveNodeConfigSync } from './node-config-sync.ts';

describe('resolveNodeConfigSync', () => {
  test('relay is always ready at target revision', () => {
    const view = resolveNodeConfigSync({
      role: 'relay',
      status: 'online',
      peerConnected: true,
      targetRevision: 4,
      ack: null,
    });
    expect(view.configSync).toBe('ready');
    expect(view.acceptedRevision).toBe(4);
  });

  test('matching accepted ack is ready', () => {
    const view = resolveNodeConfigSync({
      role: 'worker',
      status: 'online',
      peerConnected: true,
      targetRevision: 2,
      ack: { revision: 2, status: 'accepted' },
    });
    expect(view.configSync).toBe('ready');
    expect(view.syncReason).toBeNull();
  });

  test('online lag is syncing', () => {
    const view = resolveNodeConfigSync({
      role: 'worker',
      status: 'online',
      peerConnected: true,
      targetRevision: 3,
      ack: { revision: 2, status: 'accepted' },
    });
    expect(view.configSync).toBe('syncing');
  });

  test('offline lag is stale', () => {
    const view = resolveNodeConfigSync({
      role: 'worker',
      status: 'offline',
      peerConnected: false,
      targetRevision: 3,
      ack: { revision: 1, status: 'accepted' },
    });
    expect(view.configSync).toBe('stale');
  });

  test('incompatible wins', () => {
    const view = resolveNodeConfigSync({
      role: 'worker',
      status: 'online',
      peerConnected: true,
      targetRevision: 2,
      ack: { revision: 2, status: 'incompatible' },
    });
    expect(view.configSync).toBe('incompatible');
  });
});
