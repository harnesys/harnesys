import { numericKeys } from './chat-target.ts';

export interface PeerIdLike {
  peerId: string;
}

export function peerKeysOf(value: string): string[] {
  const canonical = numericKeys(value)[0];
  return canonical === undefined ? [] : [canonical];
}

export function matchPeerId<T extends PeerIdLike>(peers: readonly T[], target: string): T | null {
  const keys = new Set(peerKeysOf(target));
  if (keys.size === 0) {
    return null;
  }
  return peers.find((peer) => peerKeysOf(peer.peerId).some((key) => keys.has(key))) ?? null;
}

export interface PeerCache<T extends PeerIdLike> {
  get(target: string): T | null;
  set(peer: T): void;
  size(): number;
}

export function createPeerCache<T extends PeerIdLike>(): PeerCache<T> {
  const peers = new Map<string, T>();
  return {
    get(target: string): T | null {
      for (const key of peerKeysOf(target)) {
        const found = peers.get(key);
        if (found !== undefined) {
          return found;
        }
      }
      return null;
    },
    set(peer: T): void {
      for (const key of peerKeysOf(peer.peerId)) {
        peers.set(key, peer);
      }
    },
    size: (): number => peers.size,
  };
}
