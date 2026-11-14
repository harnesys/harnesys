import { describe, expect, test } from 'bun:test';
import { createPeerCache, matchPeerId, peerKeysOf } from './peer-lookup.ts';

interface TestPeer {
  peerId: string;
  accessHash: string;
  username: string | null;
}

const PRIVATE_PEER: TestPeer = { peerId: '4334557990', accessHash: 'hash-private', username: null };
const USER_PEER: TestPeer = { peerId: '777', accessHash: 'hash-user', username: 'someone' };
const PEERS: TestPeer[] = [PRIVATE_PEER, USER_PEER];

describe('peer lookup', () => {
  test('matches a dialog by its id or its -100 form', () => {
    expect(peerKeysOf('-1004334557990')).toEqual(['4334557990']);
    expect(matchPeerId(PEERS, '4334557990')).toEqual(PRIVATE_PEER);
    expect(matchPeerId(PEERS, '-1004334557990')).toEqual(PRIVATE_PEER);
    expect(matchPeerId(PEERS, '4334557990')?.accessHash).toBe('hash-private');
    expect(matchPeerId(PEERS, '999')).toBeNull();
  });

  test('serves cached access hashes without another dialog scan', () => {
    const cache = createPeerCache<TestPeer>();
    expect(cache.get('4334557990')).toBeNull();
    cache.set(PRIVATE_PEER);
    expect(cache.size()).toBe(1);
    expect(cache.get('4334557990')).toEqual(PRIVATE_PEER);
    expect(cache.get('-1004334557990')?.accessHash).toBe('hash-private');
    expect(cache.get('999')).toBeNull();
  });
});
