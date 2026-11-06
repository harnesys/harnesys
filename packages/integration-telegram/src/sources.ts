import type { IntegrationContext } from 'harnesys/integration';
import type { LoginSessions } from './auth/login-sessions.ts';
import { deleteSource, findSource, insertSource, listReaders, updateSource } from './db/store.ts';
import { createIngestor } from './feed/ingest.ts';
import { notFound, readerNotConnected } from './model/errors.ts';
import type { PeerKind, SourceRecord } from './model/records.ts';
import type { AddSourceBody } from './model/schemas.ts';
import { syncAutomations } from './publish.ts';
import { getHandle, joinInvite } from './telegram/runtime.ts';

function cleanPeer(peer: string): string {
  return peer
    .replace(/^https?:\/\/t\.me\//, '')
    .replace(/^\/+/, '')
    .replace(/^@/, '');
}

function firstAuthorizedReaderId(ctx: IntegrationContext): string {
  const reader = listReaders(ctx.db).find((row) => row.status === 'authorized');
  if (!reader) {
    throw readerNotConnected();
  }
  return reader.id;
}

export async function addSource(
  ctx: IntegrationContext,
  sessions: LoginSessions,
  body: AddSourceBody,
): Promise<SourceRecord> {
  const readerId = firstAuthorizedReaderId(ctx);
  const handle = await getHandle(ctx, sessions, readerId);
  const peer = await handle.resolve(cleanPeer(body.peer));
  if (body.invite) {
    await joinInvite(ctx, sessions, readerId, body.invite);
  }
  const joined = body.invite ? { ...peer, joined: true } : peer;
  const existing = ctx.db.get<{ id: string }>(
    `SELECT id FROM sources WHERE reader_id = ? AND peer_id = ?`,
    [readerId, peer.peerId],
  );
  const now = new Date().toISOString();
  const record: SourceRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    readerId,
    peerKind: peer.peerKind as PeerKind,
    peerId: peer.peerId,
    accessHash: peer.accessHash,
    username: peer.username,
    title: peer.title,
    joined: joined.joined,
    watchTopics: body.watchTopics ?? false,
    lastPostId: existing ? (findSource(ctx.db, existing.id)?.lastPostId ?? 0) : 0,
    lastError: null,
    createdAt: existing?.id ? (findSource(ctx.db, existing.id)?.createdAt ?? now) : now,
    updatedAt: now,
  };
  if (existing) {
    updateSource(ctx.db, record.id, {
      title: record.title,
      username: record.username,
      accessHash: record.accessHash,
      peerKind: record.peerKind,
      joined: record.joined,
      watchTopics: record.watchTopics,
      lastError: null,
      updatedAt: now,
    });
  } else {
    insertSource(ctx.db, record);
  }
  return record;
}

export async function refreshSource(
  ctx: IntegrationContext,
  sessions: LoginSessions,
  id: string,
): Promise<SourceRecord> {
  const source = findSource(ctx.db, id);
  if (!source) {
    throw notFound('source', id);
  }
  const handle = await getHandle(ctx, sessions, source.readerId);
  const peer = await handle.resolve(source.username ?? source.peerId);
  updateSource(ctx.db, id, {
    title: peer.title,
    username: peer.username,
    accessHash: peer.accessHash,
    joined: peer.joined,
    lastError: null,
  });
  const saved = findSource(ctx.db, id);
  if (!saved) {
    throw notFound('source', id);
  }
  return saved;
}

export function removeSource(ctx: IntegrationContext, id: string): void {
  if (!findSource(ctx.db, id)) {
    throw notFound('source', id);
  }
  deleteSource(ctx.db, id);
  syncAutomations(ctx);
}

export async function backfillSource(
  ctx: IntegrationContext,
  sessions: LoginSessions,
  id: string,
  limit: number,
): Promise<{ fetched: number; stored: number }> {
  const source = findSource(ctx.db, id);
  if (!source) {
    throw notFound('source', id);
  }
  const handle = await getHandle(ctx, sessions, source.readerId);
  const posts = await handle.history(source, limit);
  const ingestor = createIngestor(ctx);
  let stored = 0;
  for (const post of posts) {
    const known = ctx.db.get<{ id: string }>(
      `SELECT id FROM posts WHERE source_id = ? AND post_id = ?`,
      [source.id, post.postId],
    );
    await ingestor.onPost(source.peerId, post);
    if (!known) {
      stored += 1;
    }
  }
  return { fetched: posts.length, stored };
}

export function sourceTitle(ctx: IntegrationContext, sourceId: string): string {
  return findSource(ctx.db, sourceId)?.title ?? 'Unknown';
}
