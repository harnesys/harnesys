import { AddonError } from '@harnesys/sdk';
import bigInt from 'big-integer';
import * as telegram from 'teleproto';
import { StringSession } from 'teleproto/sessions';

export interface FeedCredentials {
  apiId: number;
  apiHash: string;
  session: string;
}

export interface ResolvedPeer {
  peerId: string;
  accessHash: string;
  username: string | null;
  title: string;
  kind: 'channel' | 'group' | 'supergroup';
  joined: boolean;
}

export interface RawPost {
  postId: number;
  text: string;
  publishedAt: string;
  topicId: number | null;
  mediaKind: string | null;
}

export interface FeedClient {
  me(): Promise<string>;
  resolve(peer: string): Promise<ResolvedPeer>;
  fetchLatest(peer: ResolvedPeer, limit: number): Promise<RawPost[]>;
  close(): Promise<void>;
}

const MEDIA_KINDS: Record<string, string> = {
  MessageMediaPhoto: 'photo',
  MessageMediaDocument: 'document',
  MessageMediaVideo: 'video',
  MessageMediaVoice: 'voice',
  MessageMediaAudio: 'audio',
  MessageMediaAnimation: 'animation',
  MessageMediaSticker: 'sticker',
  MessageMediaPoll: 'poll',
  MessageMediaDice: 'dice',
  MessageMediaWebPage: 'web-page',
  MessageMediaContact: 'contact',
  MessageMediaGeo: 'location',
};

function field(entity: object, key: string): unknown {
  return (entity as Record<string, unknown>)[key];
}

function fieldString(entity: object, key: string): string | null {
  const value = field(entity, key);
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'object') {
    return String((value as { toString(): string }).toString());
  }
  return String(value);
}

function fieldNumber(entity: object, key: string): number {
  return Number(field(entity, key) ?? 0);
}

function kindOf(entity: object): 'channel' | 'group' | 'supergroup' {
  if (field(entity, 'broadcast') === true) {
    return 'channel';
  }
  if (field(entity, 'megagroup') === true) {
    return 'supergroup';
  }
  return 'group';
}

function titleOf(entity: object): string {
  const title = fieldString(entity, 'title');
  if (title) {
    return title;
  }
  const names = [fieldString(entity, 'firstName'), fieldString(entity, 'lastName')].filter(
    (part): part is string => part !== null && part.length > 0,
  );
  return names.join(' ') || 'Untitled';
}

function toResolved(entity: object): ResolvedPeer {
  return {
    peerId: fieldString(entity, 'id') ?? '',
    accessHash: fieldString(entity, 'accessHash') ?? '',
    username: fieldString(entity, 'username'),
    title: titleOf(entity),
    kind: kindOf(entity),
    joined: field(entity, 'left') !== true,
  };
}

function mediaKindOf(message: object): string | null {
  const media = field(message, 'media');
  const inner = typeof media === 'object' && media !== null ? field(media, 'media') : null;
  if (typeof inner !== 'object' || inner === null) {
    return null;
  }
  const name = fieldString(inner, 'className');
  if (name === null) {
    return null;
  }
  return MEDIA_KINDS[name] ?? name;
}

function toRaw(message: object): RawPost {
  const replyTo = field(message, 'replyTo');
  const rawTopic =
    typeof replyTo === 'object' && replyTo !== null ? fieldString(replyTo, 'forumTopicId') : null;
  const text = fieldString(message, 'text') ?? fieldString(message, 'message') ?? '';
  return {
    postId: fieldNumber(message, 'id'),
    text,
    publishedAt: new Date(fieldNumber(message, 'date') * 1000).toISOString(),
    topicId: rawTopic === null ? null : Number(rawTopic),
    mediaKind: mediaKindOf(message),
  };
}

function inputPeerOf(peer: ResolvedPeer): telegram.Api.TypeInputPeer {
  if (peer.kind === 'group') {
    return new telegram.Api.InputPeerChat({ chatId: bigInt(peer.peerId || '0') });
  }
  return new telegram.Api.InputPeerChannel({
    channelId: bigInt(peer.peerId || '0'),
    accessHash: bigInt(peer.accessHash || '0'),
  });
}

export async function openFeedClient(creds: FeedCredentials): Promise<FeedClient> {
  const store = new StringSession(creds.session);
  const client = new telegram.TelegramClient(store, creds.apiId, creds.apiHash, {
    connectionRetries: 3,
  });
  try {
    await client.connect();
    await client.getMe();
  } catch (error) {
    await client.disconnect().catch(() => undefined);
    throw new AddonError('account_failed', {
      detail: `Telegram user session is not authorized: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  return {
    async me(): Promise<string> {
      const entity = await client.getMe();
      return typeof entity === 'object' && entity !== null ? (fieldString(entity, 'id') ?? '') : '';
    },
    async resolve(peer: string): Promise<ResolvedPeer> {
      const entity = await client.getEntity(peer);
      if (typeof entity === 'string') {
        throw new AddonError('not_found', { detail: `Telegram did not resolve ${peer}` });
      }
      return toResolved(entity);
    },
    async fetchLatest(peer: ResolvedPeer, limit: number): Promise<RawPost[]> {
      const messages = await client.getMessages(inputPeerOf(peer), { limit });
      return [...messages]
        .map((message) => toRaw(message as object))
        .filter((post) => post.postId > 0)
        .sort((left, right) => left.postId - right.postId);
    },
    async close(): Promise<void> {
      await client.disconnect();
    },
  };
}
