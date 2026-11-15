export interface FeedCredentials {
  apiId: number;
  apiHash: string;
  session: string;
}

export type PeerKind = 'user' | 'group' | 'supergroup' | 'channel';

export type ParseMode = 'none' | 'markdown' | 'html';

export type OutgoingMediaKind = 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'gif';

export interface AccountProfile {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

export interface ResolvedPeer {
  peerId: string;
  accessHash: string;
  username: string | null;
  title: string;
  kind: PeerKind;
  joined: boolean;
}

export interface RawPost {
  postId: number;
  text: string;
  publishedAt: string;
  topicId: number | null;
  mediaKind: string | null;
}

export interface DialogEntry {
  kind: PeerKind;
  peerId: string;
  username: string | null;
  title: string;
  unread: number;
}

export interface ChatEntry {
  id: number;
  date: string;
  sender: string | null;
  text: string;
  mediaKind: string | null;
}

export interface MessageDetail {
  id: number;
  peerId: string | null;
  date: string;
  sender: string | null;
  text: string;
  mediaKind: string | null;
  mediaSize: number | null;
  replyToMessageId: number | null;
  forwardFrom: string | null;
  views: number | null;
  editedAt: string | null;
}

export interface SendTextOptions {
  replyTo?: number;
  parseMode: ParseMode;
  silent: boolean;
  scheduleAt?: number;
}

export interface MediaFile {
  data: Buffer;
  name: string;
  mimeType: string;
  kind: OutgoingMediaKind;
  caption?: string;
}

export interface SendMediaOptions {
  parseMode: ParseMode;
  replyTo?: number;
  silent: boolean;
  scheduleAt?: number;
  forceDocument: boolean;
}

export interface AlbumOptions {
  parseMode: ParseMode;
  replyTo?: number;
  silent: boolean;
  scheduleAt?: number;
}

export interface ForwardOptions {
  dropAuthor: boolean;
  silent: boolean;
}

export interface DownloadedMedia {
  data: Buffer;
  mimeType: string;
  fileName: string;
  mediaKind: string | null;
  size: number;
}

export interface ChatInfo {
  title: string;
  kind: PeerKind;
  username: string | null;
  about: string | null;
  participantsCount: number | null;
  isMember: boolean;
  pinnedMessageId: number | null;
  slowmodeSeconds: number | null;
}

export interface ParticipantEntry {
  id: string;
  username: string | null;
  title: string;
  isBot: boolean;
  isAdmin: boolean;
}

export interface TopicEntry {
  id: number;
  title: string;
  closed: boolean;
  pinned: boolean;
  unread: number;
}

export interface ParticipantQuery {
  limit: number;
  search?: string;
  adminsOnly: boolean;
}

export interface FeedClientOptions {
  dialogLimit?: number;
}

export interface FeedClient {
  me(): Promise<string>;
  account(): Promise<AccountProfile>;
  resolve(peer: string): Promise<ResolvedPeer>;
  fetchLatest(peer: ResolvedPeer, limit: number): Promise<RawPost[]>;
  dialogs(limit: number): Promise<DialogEntry[]>;
  history(peer: ResolvedPeer, limit: number, beforeId?: number): Promise<ChatEntry[]>;
  message(peer: ResolvedPeer, messageId: number): Promise<MessageDetail>;
  search(query: string, peer: ResolvedPeer | undefined, limit: number): Promise<MessageDetail[]>;
  chatInfo(peer: ResolvedPeer): Promise<ChatInfo>;
  participants(peer: ResolvedPeer, query: ParticipantQuery): Promise<ParticipantEntry[]>;
  topics(peer: ResolvedPeer, limit: number): Promise<TopicEntry[]>;
  createTopic(peer: ResolvedPeer, title: string): Promise<number>;
  sendText(peer: ResolvedPeer, text: string, options: SendTextOptions): Promise<number>;
  sendMedia(peer: ResolvedPeer, media: MediaFile, options: SendMediaOptions): Promise<number>;
  sendAlbum(
    peer: ResolvedPeer,
    files: readonly MediaFile[],
    options: AlbumOptions,
  ): Promise<number[]>;
  forward(
    from: ResolvedPeer,
    messageIds: readonly number[],
    to: ResolvedPeer,
    options: ForwardOptions,
  ): Promise<number[]>;
  editText(
    peer: ResolvedPeer,
    messageId: number,
    text: string,
    parseMode: ParseMode,
  ): Promise<void>;
  deleteMessages(peer: ResolvedPeer, messageIds: readonly number[], revoke: boolean): Promise<void>;
  pinMessage(peer: ResolvedPeer, messageId: number, notify: boolean): Promise<void>;
  unpinMessage(peer: ResolvedPeer, messageId?: number): Promise<void>;
  react(peer: ResolvedPeer, messageId: number, emoji: string): Promise<void>;
  join(peer: ResolvedPeer): Promise<void>;
  joinInvite(link: string): Promise<ResolvedPeer | null>;
  leave(peer: ResolvedPeer): Promise<void>;
  download(peer: ResolvedPeer, messageId: number, maxBytes: number): Promise<DownloadedMedia>;
  markRead(peer: ResolvedPeer): Promise<void>;
  close(): Promise<void>;
}
