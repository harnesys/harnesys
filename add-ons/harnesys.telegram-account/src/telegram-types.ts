export interface FeedCredentials {
  apiId: number;
  apiHash: string;
  session: string;
}

export type PeerKind = 'user' | 'group' | 'supergroup' | 'channel';

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
  sendText(peer: ResolvedPeer, text: string): Promise<number>;
  forward(from: ResolvedPeer, messageId: number, to: ResolvedPeer): Promise<number>;
  markRead(peer: ResolvedPeer): Promise<void>;
  close(): Promise<void>;
}
