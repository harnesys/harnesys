import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type {
  MemoryRecord,
  MemoryScopeId,
  SemanticListQuery,
  SemanticMemoryPort,
  SemanticProjectInput,
  SemanticProjectQueryInput,
  SemanticScope,
  SemanticUpdateInput,
  SemanticUpsertInput,
} from 'harnesys';
import { formatFactLine, relevanceScore } from 'harnesys';
import {
  cosineSimilarity,
  decodeEmbedding,
  encodeEmbedding,
} from '../../knowledge/embedding-vec.ts';
import type { EmbeddingsPort } from '../../knowledge/embeddings.ts';
import type { OrgSqliteDb } from '../../org-sqlite/org-sqlite-session.ts';
import { type MemoryFactRow, memoryFactsTable } from '../../org-sqlite/schema/agent-memory.ts';
import {
  idOrder,
  threadOf,
  toMemoryRecord,
  toMemorySource,
  visibilityOf,
} from './org-semantic-rows.ts';

const SCAN_LIMIT = 1000;

export class OrgSemanticPort implements SemanticMemoryPort {
  constructor(
    private readonly db: OrgSqliteDb,
    private readonly embeddings?: EmbeddingsPort,
  ) {}

  list(scopeId: MemoryScopeId, query: SemanticListQuery): Promise<MemoryRecord[]> {
    const filters = [
      eq(memoryFactsTable.orgId, scopeId.orgId),
      eq(memoryFactsTable.agentName, scopeId.agentName),
    ];
    if (query.scope !== undefined) {
      filters.push(eq(memoryFactsTable.scope, query.scope));
    }
    const base = this.db
      .select()
      .from(memoryFactsTable)
      .where(and(...filters, visibilityOf(scopeId)))
      .orderBy(desc(memoryFactsTable.updatedAt), asc(memoryFactsTable.id));
    const rows = query.limit === undefined ? base.all() : base.limit(query.limit).all();
    return Promise.resolve(rows.map(toMemoryRecord));
  }

  async upsert(scopeId: MemoryScopeId, input: SemanticUpsertInput): Promise<MemoryRecord> {
    const now = new Date().toISOString();
    if (input.key !== undefined) {
      const existing = this.findKeyed(scopeId, input.scope, input.key, input.threadId);
      if (existing) {
        const threadId = input.threadId ?? existing.threadId;
        this.db
          .update(memoryFactsTable)
          .set({ text: input.text, source: input.source, threadId, updatedAt: now })
          .where(eq(memoryFactsTable.id, existing.id))
          .run();
        await this.writeEmbedding(existing.id, input.text);
        return {
          ...toMemoryRecord(existing),
          text: input.text,
          source: input.source,
          threadId: threadId ?? undefined,
          updatedAt: now,
        };
      }
    }
    const id = crypto.randomUUID();
    this.db
      .insert(memoryFactsTable)
      .values({
        id,
        orgId: scopeId.orgId,
        agentName: scopeId.agentName,
        scope: input.scope,
        text: input.text,
        key: input.key ?? null,
        threadId: input.threadId ?? null,
        source: input.source,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await this.writeEmbedding(id, input.text);
    return {
      id,
      scope: input.scope,
      text: input.text,
      key: input.key,
      createdAt: now,
      updatedAt: now,
      source: input.source,
      threadId: input.threadId,
    };
  }

  async update(scopeId: MemoryScopeId, input: SemanticUpdateInput): Promise<MemoryRecord> {
    const row = this.db
      .select()
      .from(memoryFactsTable)
      .where(
        and(
          eq(memoryFactsTable.id, input.id),
          eq(memoryFactsTable.orgId, scopeId.orgId),
          eq(memoryFactsTable.agentName, scopeId.agentName),
        ),
      )
      .get();
    if (!row) {
      throw new Error(`memory fact ${input.id} not found for agent ${scopeId.agentName}`);
    }
    const updatedAt = new Date().toISOString();
    this.db
      .update(memoryFactsTable)
      .set({ text: input.text, updatedAt })
      .where(eq(memoryFactsTable.id, input.id))
      .run();
    await this.writeEmbedding(input.id, input.text);
    return { ...toMemoryRecord(row), text: input.text, updatedAt };
  }

  projectForWindow(scopeId: MemoryScopeId, input: SemanticProjectInput): Promise<string> {
    const rows = this.db
      .select()
      .from(memoryFactsTable)
      .where(
        and(
          eq(memoryFactsTable.orgId, scopeId.orgId),
          eq(memoryFactsTable.agentName, scopeId.agentName),
          inArray(memoryFactsTable.scope, input.scopes),
          visibilityOf(scopeId),
          isNull(memoryFactsTable.supersededBy),
        ),
      )
      .orderBy(
        desc(memoryFactsTable.updatedAt),
        desc(memoryFactsTable.importance),
        asc(memoryFactsTable.id),
      )
      .limit(input.limit)
      .all();
    const now = new Date().toISOString();
    const lines: string[] = [];
    let spent = 0;
    for (const row of rows) {
      const cost = Math.ceil(row.text.length / 4);
      if (spent + cost > input.budgetTokens) {
        break;
      }
      spent += cost;
      lines.push(row.text);
      this.db
        .update(memoryFactsTable)
        .set({ lastAccessedAt: now, accessCount: row.accessCount + 1 })
        .where(eq(memoryFactsTable.id, row.id))
        .run();
    }
    return Promise.resolve(lines.join('\n'));
  }

  async projectForQuery(scopeId: MemoryScopeId, input: SemanticProjectQueryInput): Promise<string> {
    const rows = this.db
      .select()
      .from(memoryFactsTable)
      .where(
        and(
          eq(memoryFactsTable.orgId, scopeId.orgId),
          eq(memoryFactsTable.agentName, scopeId.agentName),
          inArray(memoryFactsTable.scope, input.scopes),
          visibilityOf(scopeId),
          isNull(memoryFactsTable.supersededBy),
        ),
      )
      .orderBy(desc(memoryFactsTable.updatedAt), asc(memoryFactsTable.id))
      .limit(SCAN_LIMIT)
      .all();
    if (rows.length === 0) {
      return '';
    }
    const nowMs = Date.now();
    const selected = await this.selectForQuery(rows, input, nowMs);
    const now = new Date(nowMs).toISOString();
    const lines: string[] = [];
    let spent = 0;
    for (const row of selected) {
      const line = formatFactLine(
        { text: row.text, source: toMemorySource(row.source) },
        input.clipChars,
      );
      const cost = Math.ceil(line.length / 4);
      if (spent + cost > input.budgetTokens) {
        break;
      }
      spent += cost;
      lines.push(line);
      this.db
        .update(memoryFactsTable)
        .set({ lastAccessedAt: now, accessCount: row.accessCount + 1 })
        .where(eq(memoryFactsTable.id, row.id))
        .run();
    }
    return lines.join('\n');
  }

  remove(scopeId: MemoryScopeId, id: string): Promise<void> {
    this.db
      .delete(memoryFactsTable)
      .where(
        and(
          eq(memoryFactsTable.id, id),
          eq(memoryFactsTable.orgId, scopeId.orgId),
          eq(memoryFactsTable.agentName, scopeId.agentName),
        ),
      )
      .run();
    return Promise.resolve();
  }

  private findKeyed(
    scopeId: MemoryScopeId,
    scope: SemanticScope,
    key: string,
    threadId: string | undefined,
  ): MemoryFactRow | undefined {
    return this.db
      .select()
      .from(memoryFactsTable)
      .where(
        and(
          eq(memoryFactsTable.orgId, scopeId.orgId),
          eq(memoryFactsTable.agentName, scopeId.agentName),
          eq(memoryFactsTable.scope, scope),
          eq(memoryFactsTable.key, key),
          scope === 'session' ? threadOf(threadId) : undefined,
        ),
      )
      .get();
  }

  private async selectForQuery(
    rows: MemoryFactRow[],
    input: SemanticProjectQueryInput,
    nowMs: number,
  ): Promise<MemoryFactRow[]> {
    const model = this.embedModel();
    const queryVec = model === undefined ? undefined : await this.embedQuery(input.query);
    const vectorScored: Array<{ row: MemoryFactRow; score: number }> = [];
    const hot: MemoryFactRow[] = [];
    for (const row of rows) {
      const matches = model !== undefined && row.embeddingModel === model;
      const vec = matches ? decodeEmbedding(row.embedding) : undefined;
      if (queryVec !== undefined && vec !== undefined) {
        vectorScored.push({ row, score: cosineSimilarity(queryVec, vec) });
      } else {
        hot.push(row);
      }
    }
    vectorScored.sort((a, b) => b.score - a.score || idOrder(a.row.id, b.row.id));
    const selected = vectorScored.slice(0, input.topK).map((entry) => entry.row);
    if (selected.length < input.topK) {
      const hotRanked = hot
        .map((row) => ({ row, score: relevanceScore(row, nowMs, input.halfLifeDays) }))
        .sort((a, b) => b.score - a.score || idOrder(a.row.id, b.row.id));
      for (const entry of hotRanked) {
        if (selected.length >= input.topK) {
          break;
        }
        selected.push(entry.row);
      }
    }
    return selected;
  }

  private embedModel(): string | undefined {
    return this.embeddings?.available() === true
      ? this.embeddings.resolvedModel?.()?.model
      : undefined;
  }

  private async embedQuery(query: string): Promise<number[] | undefined> {
    try {
      return (await this.embeddings?.embed([query]))?.[0];
    } catch {
      return undefined;
    }
  }

  private async writeEmbedding(id: string, text: string): Promise<void> {
    const model = this.embedModel();
    if (model === undefined || this.embeddings === undefined) {
      return;
    }
    try {
      const [vec] = await this.embeddings.embed([text]);
      if (vec === undefined) {
        this.clearEmbedding(id);
        return;
      }
      this.db
        .update(memoryFactsTable)
        .set({ embedding: encodeEmbedding(vec), embeddingModel: model })
        .where(eq(memoryFactsTable.id, id))
        .run();
    } catch {
      this.clearEmbedding(id);
    }
  }

  private clearEmbedding(id: string): void {
    this.db
      .update(memoryFactsTable)
      .set({ embedding: null, embeddingModel: null })
      .where(eq(memoryFactsTable.id, id))
      .run();
  }
}
