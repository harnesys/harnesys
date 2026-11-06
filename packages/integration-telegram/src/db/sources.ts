import type { AddonDatabase } from 'harnesys/integration';
import type { PeerKind, SourceRecord } from '../model/records.ts';
import { assign, bool, flag, num, optText, type Row, text } from './rows.ts';

function toSource(row: Row): SourceRecord {
  return {
    id: text(row, 'id'),
    readerId: text(row, 'reader_id'),
    peerKind: text(row, 'peer_kind') as PeerKind,
    peerId: text(row, 'peer_id'),
    accessHash: text(row, 'access_hash'),
    username: optText(row, 'username'),
    title: text(row, 'title'),
    joined: bool(row, 'joined'),
    watchTopics: bool(row, 'watch_topics'),
    lastPostId: num(row, 'last_post_id'),
    lastError: optText(row, 'last_error'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  };
}

export function insertSource(db: AddonDatabase, rec: SourceRecord): void {
  db.run(
    `INSERT INTO sources (id, reader_id, peer_kind, peer_id, access_hash, username, title, joined,
      watch_topics, last_post_id, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rec.id,
      rec.readerId,
      rec.peerKind,
      rec.peerId,
      rec.accessHash,
      rec.username,
      rec.title,
      flag(rec.joined),
      flag(rec.watchTopics),
      rec.lastPostId,
      rec.lastError,
      rec.createdAt,
      rec.updatedAt,
    ],
  );
}

export function listSources(db: AddonDatabase): SourceRecord[] {
  return db.all<Row>(`SELECT * FROM sources ORDER BY title COLLATE NOCASE ASC`).map(toSource);
}

export function findSource(db: AddonDatabase, id: string): SourceRecord | undefined {
  const row = db.get<Row>(`SELECT * FROM sources WHERE id = ?`, [id]);
  return row ? toSource(row) : undefined;
}

export function findSourceByPeer(db: AddonDatabase, peerId: string): SourceRecord | undefined {
  const row = db.get<Row>(`SELECT * FROM sources WHERE peer_id = ?`, [peerId]);
  return row ? toSource(row) : undefined;
}

export function updateSource(
  db: AddonDatabase,
  id: string,
  patch: Partial<Omit<SourceRecord, 'id' | 'createdAt'>>,
): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  assign(sets, params, 'title', patch.title);
  assign(sets, params, 'username', patch.username);
  assign(sets, params, 'access_hash', patch.accessHash);
  assign(sets, params, 'peer_kind', patch.peerKind);
  assign(sets, params, 'joined', patch.joined === undefined ? undefined : flag(patch.joined));
  assign(
    sets,
    params,
    'watch_topics',
    patch.watchTopics === undefined ? undefined : flag(patch.watchTopics),
  );
  assign(sets, params, 'last_post_id', patch.lastPostId);
  assign(sets, params, 'last_error', patch.lastError);
  assign(sets, params, 'updated_at', patch.updatedAt ?? new Date().toISOString());
  params.push(id);
  db.run(`UPDATE sources SET ${sets.join(', ')} WHERE id = ?`, params);
}

export function deleteSource(db: AddonDatabase, id: string): void {
  db.run(`DELETE FROM sources WHERE id = ?`, [id]);
}
