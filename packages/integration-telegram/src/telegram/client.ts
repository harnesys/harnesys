import bigInt from 'big-integer';
import * as telegram from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import type { LoginSessions } from '../auth/login-sessions.ts';
import { type NormalizedPost, normalizePost } from '../feed/normalize.ts';
import type { PeerKind } from '../model/records.ts';

export interface FeedCredentials {
  apiId: number;
  apiHash: string;
}

export interface ResolvedPeer {
  peerId: string;
  accessHash: string;
  username: string | null;
  title: string;
  peerKind: PeerKind;
  joined: boolean;
}

export type PostSink = (peerId: string, post: NormalizedPost) => void;

export interface ClientHandle {
  readonly dcId: number;
  readonly sessionString: string;
  resolve(target: string): Promise<ResolvedPeer>;
  join(peer: ResolvedPeer): Promise<ResolvedPeer>;
  joinInvite(hash: string): Promise<void>;
  history(peer: ResolvedPeer, limit: number): Promise<NormalizedPost[]>;
  onPost(sink: PostSink): () => void;
  close(): Promise<void>;
}

interface NewMessageEvent {
  message?: object;
}

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

function fieldBool(entity: object, key: string): boolean {
  return field(entity, key) === true;
}

function peerKindOf(entity: object): PeerKind {
  if (fieldBool(entity, 'broadcast')) {
    return 'channel';
  }
  if (fieldBool(entity, 'megagroup')) {
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
    peerKind: peerKindOf(entity),
    joined: field(entity, 'left') !== true,
  };
}

function peerIdOf(message: object): string | null {
  const peer = field(message, 'peerId');
  if (typeof peer !== 'object' || peer === null) {
    return null;
  }
  return (
    fieldString(peer, 'channelId') ?? fieldString(peer, 'chatId') ?? fieldString(peer, 'userId')
  );
}

function inputChannel(peer: ResolvedPeer): telegram.Api.TypeInputChannel {
  return new telegram.Api.InputChannel({
    channelId: bigInt(peer.peerId || '0'),
    accessHash: bigInt(peer.accessHash || '0'),
  });
}

function inputPeerOf(peer: ResolvedPeer): telegram.Api.TypeInputPeer {
  if (peer.peerKind === 'group') {
    return new telegram.Api.InputPeerChat({ chatId: bigInt(peer.peerId || '0') });
  }
  return new telegram.Api.InputPeerChannel({
    channelId: bigInt(peer.peerId || '0'),
    accessHash: bigInt(peer.accessHash || '0'),
  });
}

function entityOf(peer: ResolvedPeer): string | telegram.Api.TypeInputPeer {
  return peer.username ?? inputPeerOf(peer);
}

function senderNameOf(message: object): string | null {
  if (typeof field(message, 'getSenderName') !== 'function') {
    return null;
  }
  const name = (message as { getSenderName(): string | null }).getSenderName?.();
  return name && name.length > 0 ? name : null;
}

function normalizeMessage(message: object): NormalizedPost {
  const replyTo = field(message, 'replyTo');
  const topicId =
    typeof replyTo === 'object' && replyTo !== null ? fieldString(replyTo, 'forumTopicId') : null;
  const media = field(message, 'media');
  const inner = typeof media === 'object' && media !== null ? field(media, 'media') : null;
  return normalizePost({
    id: fieldNumber(message, 'id'),
    date: fieldNumber(message, 'date'),
    text: fieldString(message, 'text') ?? fieldString(message, 'message') ?? '',
    topicId: topicId === null ? null : Number(topicId),
    mediaName:
      typeof inner === 'object' && inner !== null
        ? (fieldString(inner, 'className') ?? undefined)
        : undefined,
    senderName: senderNameOf(message),
  });
}

class TeleprotoHandle implements ClientHandle {
  private readonly listeners = new Set<PostSink>();
  private readonly detach: () => void;

  constructor(
    private readonly client: telegram.TelegramClient,
    private readonly session: StringSession,
  ) {
    const dispatch = (event: NewMessageEvent): void => {
      this.handleEvent(event);
    };
    this.client.addEventHandler(dispatch, new telegram.events.NewMessage());
    this.detach = () => this.client.removeEventHandler(dispatch, new telegram.events.NewMessage());
  }

  private handleEvent(event: NewMessageEvent): void {
    const message = event.message;
    if (!message) {
      return;
    }
    const peerId = peerIdOf(message);
    if (!peerId) {
      return;
    }
    const post = normalizeMessage(message);
    for (const listener of this.listeners) {
      listener(peerId, post);
    }
  }

  get dcId(): number {
    return this.session.dcId ?? 0;
  }

  get sessionString(): string {
    return this.session.save();
  }

  async resolve(target: string): Promise<ResolvedPeer> {
    const entity = await this.client.getEntity(target);
    if (typeof entity === 'string') {
      throw new Error(`Telegram did not resolve ${target}`);
    }
    return toResolved(entity);
  }

  async join(peer: ResolvedPeer): Promise<ResolvedPeer> {
    if (peer.joined) {
      return peer;
    }
    await this.client.invoke(
      new telegram.Api.channels.JoinChannel({ channel: inputChannel(peer) }),
    );
    return { ...peer, joined: true };
  }

  async history(peer: ResolvedPeer, limit: number): Promise<NormalizedPost[]> {
    const messages = await this.client.getMessages(entityOf(peer), { limit });
    return [...messages].reverse().map(normalizeMessage);
  }

  async joinInvite(hash: string): Promise<void> {
    await this.client.invoke(new telegram.Api.messages.ImportChatInvite({ hash }));
  }

  onPost(sink: PostSink): () => void {
    this.listeners.add(sink);
    return () => this.listeners.delete(sink);
  }

  async close(): Promise<void> {
    this.detach();
    this.listeners.clear();
    await this.client.disconnect();
  }
}

function createClient(
  creds: FeedCredentials,
  session: string,
): { client: telegram.TelegramClient; session: StringSession } {
  const store = new StringSession(session);
  return {
    client: new telegram.TelegramClient(store, creds.apiId, creds.apiHash, {}),
    session: store,
  };
}

export async function openClient(creds: FeedCredentials, session: string): Promise<ClientHandle> {
  const { client, session: store } = createClient(creds, session);
  await client.connect();
  return new TeleprotoHandle(client, store);
}

export async function loginClient(
  creds: FeedCredentials,
  phone: string,
  sessions: LoginSessions,
  readerId: string,
  onPrompt?: (kind: 'code' | 'password') => void,
): Promise<ClientHandle> {
  const { client, session } = createClient(creds, '');
  await client.start({
    phoneNumber: async () => phone,
    phoneCode: async () => {
      onPrompt?.('code');
      return sessions.waitFor(readerId, 'code');
    },
    password: async () => {
      onPrompt?.('password');
      return sessions.waitFor(readerId, 'password');
    },
    onError: async (err: Error) => {
      throw err;
    },
  });
  return new TeleprotoHandle(client, session);
}
