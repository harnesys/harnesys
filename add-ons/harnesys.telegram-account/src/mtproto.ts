import { AddonError } from '@harnesys/sdk';
import * as telegram from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import { numericKeys } from './chat-target.ts';
import { createJoinMethods } from './mtproto-join.ts';
import { createMediaMethods } from './mtproto-media.ts';
import { inputPeerOf } from './mtproto-peer.ts';
import { createReadMethods } from './mtproto-read.ts';
import { createSendMethods } from './mtproto-send.ts';
import { createPeerCache, matchPeerId } from './peer-lookup.ts';
import {
  field,
  fieldString,
  toChatEntry,
  toDialog,
  toRaw,
  toResolved,
} from './telegram-entities.ts';
import type {
  AccountProfile,
  ChatEntry,
  DialogEntry,
  FeedClient,
  FeedClientOptions,
  FeedCredentials,
  RawPost,
  ResolvedPeer,
} from './telegram-types.ts';

export const DEFAULT_DIALOG_SCAN_LIMIT = 500;

function numericPeerIdOf(peer: string): string | null {
  return numericKeys(peer.trim())[0] ?? null;
}

export async function openFeedClient(
  creds: FeedCredentials,
  options?: FeedClientOptions,
): Promise<FeedClient> {
  const store = new StringSession(creds.session);
  const client = new telegram.TelegramClient(store, creds.apiId, creds.apiHash, {
    connectionRetries: 3,
  });
  const dialogLimit = options?.dialogLimit ?? DEFAULT_DIALOG_SCAN_LIMIT;
  const known = createPeerCache<ResolvedPeer>();
  let self: telegram.Api.User | null = null;
  try {
    await client.connect();
    self = await client.getMe();
  } catch (error) {
    await client.disconnect().catch(() => undefined);
    throw new AddonError('account_failed', {
      detail: `Telegram user session is not authorized: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  async function scanDialogs(): Promise<ResolvedPeer[]> {
    const dialogs = await client.getDialogs({ limit: dialogLimit });
    const peers: ResolvedPeer[] = [];
    for (const dialog of dialogs) {
      const entity = field(dialog as object, 'entity');
      if (typeof entity !== 'object' || entity === null) {
        continue;
      }
      const peer = toResolved(entity);
      if (peer.peerId.length === 0) {
        continue;
      }
      known.set(peer);
      peers.push(peer);
    }
    return peers;
  }
  async function resolveById(peerId: string): Promise<ResolvedPeer> {
    const cached = known.get(peerId);
    if (cached !== null) {
      return cached;
    }
    const found = matchPeerId(await scanDialogs(), peerId);
    if (found !== null) {
      return found;
    }
    throw new AddonError('not_found', {
      detail: `the bound account is not a member of private chat ${peerId}; join it with this account, or pass an @username the account can resolve`,
    });
  }
  return {
    async me(): Promise<string> {
      const entity = await client.getMe();
      return typeof entity === 'object' && entity !== null ? (fieldString(entity, 'id') ?? '') : '';
    },
    async account(): Promise<AccountProfile> {
      const entity = self ?? (await client.getMe());
      self = entity;
      return {
        id: fieldString(entity, 'id') ?? '',
        username: fieldString(entity, 'username'),
        firstName: fieldString(entity, 'firstName'),
        lastName: fieldString(entity, 'lastName'),
        phone: fieldString(entity, 'phone'),
      };
    },
    async resolve(peer: string): Promise<ResolvedPeer> {
      const numericId = numericPeerIdOf(peer);
      if (numericId !== null) {
        return resolveById(numericId);
      }
      const entity = await client.getEntity(peer);
      if (typeof entity === 'string') {
        throw new AddonError('not_found', { detail: `Telegram did not resolve ${peer}` });
      }
      const resolved = toResolved(entity);
      known.set(resolved);
      return resolved;
    },
    async fetchLatest(peer: ResolvedPeer, limit: number): Promise<RawPost[]> {
      const messages = await client.getMessages(inputPeerOf(peer), { limit });
      return [...messages]
        .map((message) => toRaw(message as object))
        .filter((post) => post.postId > 0)
        .sort((left, right) => left.postId - right.postId);
    },
    async dialogs(limit: number): Promise<DialogEntry[]> {
      const dialogs = await client.getDialogs({ limit });
      return dialogs.map((dialog) => toDialog(dialog as object));
    },
    async history(peer: ResolvedPeer, limit: number, beforeId?: number): Promise<ChatEntry[]> {
      const messages = await client.getMessages(inputPeerOf(peer), {
        limit,
        ...(beforeId === undefined ? {} : { offsetId: beforeId }),
      });
      return messages
        .map((message) => toChatEntry(message as object))
        .filter((entry) => entry.id > 0);
    },
    async markRead(peer: ResolvedPeer): Promise<void> {
      await client.markAsRead(inputPeerOf(peer));
    },
    ...createSendMethods(client),
    ...createReadMethods(client),
    ...createMediaMethods(client),
    ...createJoinMethods(client),
    async close(): Promise<void> {
      await client.disconnect();
    },
  };
}
