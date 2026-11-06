import type { AddonDatabase } from 'harnesys/integration';
import type { PostOutcome, PostRecord } from '../model/records.ts';
import { json, num, optText, type Row, text } from './rows.ts';

function toPost(row: Row): PostRecord {
  return {
    id: text(row, 'id'),
    sourceId: text(row, 'source_id'),
    postId: num(row, 'post_id'),
    topicId: optText(row, 'topic_id') === null ? null : Number(optText(row, 'topic_id')),
    authorTitle: optText(row, 'author_title'),
    text: text(row, 'text'),
    mediaKinds: json<string[]>(row, 'media_json', []),
    publishedAt: text(row, 'published_at'),
    receivedAt: text(row, 'received_at'),
    outcome: text(row, 'outcome') as PostOutcome,
    fireCount: num(row, 'fire_count'),
  };
}

export function insertPost(db: AddonDatabase, rec: PostRecord): 'inserted' | 'duplicate' {
  const inserted = db.insertReturning<{ id: string }>(
    `INSERT INTO posts (id, source_id, post_id, topic_id, author_title, text, media_json,
      published_at, received_at, outcome, fire_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (source_id, post_id) DO NOTHING RETURNING id`,
    [
      rec.id,
      rec.sourceId,
      rec.postId,
      rec.topicId,
      rec.authorTitle,
      rec.text,
      JSON.stringify(rec.mediaKinds),
      rec.publishedAt,
      rec.receivedAt,
      rec.outcome,
      rec.fireCount,
    ],
  );
  return inserted !== undefined ? 'inserted' : 'duplicate';
}

export function listPosts(
  db: AddonDatabase,
  input: { sourceId?: string; outcome?: PostOutcome; limit: number },
): PostRecord[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (input.sourceId) {
    where.push('source_id = ?');
    params.push(input.sourceId);
  }
  if (input.outcome) {
    where.push('outcome = ?');
    params.push(input.outcome);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  params.push(input.limit);
  return db
    .all<Row>(`SELECT * FROM posts ${clause} ORDER BY received_at DESC LIMIT ?`, params)
    .map(toPost);
}

export function updatePost(
  db: AddonDatabase,
  id: string,
  patch: { outcome?: PostOutcome; fireCount?: number },
): void {
  if (patch.outcome !== undefined) {
    db.run(`UPDATE posts SET outcome = ? WHERE id = ?`, [patch.outcome, id]);
  }
  if (patch.fireCount !== undefined) {
    db.run(`UPDATE posts SET fire_count = ? WHERE id = ?`, [patch.fireCount, id]);
  }
}

export function prunePosts(
  db: AddonDatabase,
  keepPerSource: number,
  maxAgeDays: number,
  keepFiresPerRule = 200,
): void {
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
  db.run(
    `DELETE FROM posts WHERE received_at < ? OR id IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY received_at DESC) AS rn
         FROM posts
       ) WHERE rn > ?
     )`,
    [cutoff, keepPerSource],
  );
  db.run(
    `DELETE FROM fires WHERE created_at < ? OR fire_id IN (
       SELECT fire_id FROM (
         SELECT fire_id, ROW_NUMBER() OVER (PARTITION BY rule_id ORDER BY created_at DESC) AS rn
         FROM fires
       ) WHERE rn > ?
     )`,
    [cutoff, keepFiresPerRule],
  );
}

export function claimFire(
  db: AddonDatabase,
  fireId: string,
  ruleId: string,
  postId: string,
): boolean {
  const now = new Date().toISOString();
  const inserted = db.insertReturning<{ id: string }>(
    `INSERT INTO fires (fire_id, rule_id, post_id, created_at)
     VALUES (?, ?, ?, ?) ON CONFLICT (fire_id) DO NOTHING RETURNING fire_id`,
    [fireId, ruleId, postId, now],
  );
  return inserted !== undefined;
}

export function releaseFire(db: AddonDatabase, fireId: string): void {
  db.run(`DELETE FROM fires WHERE fire_id = ?`, [fireId]);
}
