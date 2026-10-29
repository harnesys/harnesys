import { eq } from 'drizzle-orm';
import type { KnowledgeHit } from 'harnesys';
import { KnowledgeValidationException } from '../../domain/knowledge/knowledge.error.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { knowledgeChunksTable } from '../org-sqlite/schema/index.ts';
import { cosineSimilarity, decodeEmbedding } from './embedding-vec.ts';
import type { EmbeddingsPort } from './embeddings.ts';
import { buildFtsMatchQuery } from './fts-query.ts';
import { sqliteClient } from './sqlite-client.ts';

interface KnowledgeFtsRow {
  id: string;
  title: string | null;
  text: string;
  uri: string;
  rank: number;
}
export function searchKnowledgeFts(
  db: OrgSqliteDb,
  sourceId: string,
  query: string,
  limit: number,
): KnowledgeHit[] {
  const match = buildFtsMatchQuery(query);
  if (!match) {
    return [];
  }
  const sqlite = sqliteClient(db);
  const rows = sqlite
    .query(`SELECT c.id AS id, c.title AS title, c.text AS text, c.uri AS uri,
              bm25(knowledge_chunks_fts) AS rank
       FROM knowledge_chunks_fts
       JOIN knowledge_chunks c ON c.rowid = knowledge_chunks_fts.rowid
       WHERE knowledge_chunks_fts MATCH ? AND c.source_id = ?
       ORDER BY rank
       LIMIT ?`)
    .all(match, sourceId, limit) as KnowledgeFtsRow[];
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    ...(row.title ? { title: row.title } : {}),
    ...(row.uri ? { uri: row.uri } : {}),
    score: typeof row.rank === 'number' ? -row.rank : undefined,
  }));
}
export interface SearchKnowledgeVectorInput {
  db: OrgSqliteDb;
  sourceId: string;
  query: string;
  limit: number;
  embeddings: EmbeddingsPort | undefined;
}
export async function searchKnowledgeVector(
  input: SearchKnowledgeVectorInput,
): Promise<KnowledgeHit[]> {
  const { db, sourceId, query, limit, embeddings } = input;
  if (!embeddings?.available()) {
    throw new KnowledgeValidationException(
      'knowledge vector search needs an embeddings model; use backend "fts" or configure embed model',
    );
  }
  const [queryVec] = await embeddings.embed([query]);
  if (!queryVec) {
    return [];
  }
  const rows = db
    .select()
    .from(knowledgeChunksTable)
    .where(eq(knowledgeChunksTable.sourceId, sourceId))
    .all();
  const scored: KnowledgeHit[] = [];
  for (const row of rows) {
    const vec = decodeEmbedding(row.embedding as Buffer | null);
    if (!vec) {
      continue;
    }
    scored.push({
      id: row.id,
      text: row.text,
      ...(row.title ? { title: row.title } : {}),
      ...(row.uri ? { uri: row.uri } : {}),
      score: cosineSimilarity(queryVec, vec),
    });
  }
  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, limit);
}
