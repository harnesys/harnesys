import { and, eq } from 'drizzle-orm';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { memoryConsolidationsTable } from '../org-sqlite/schema/agent-memory.ts';

export interface ConsolidationCursor {
  orgId: string;
  agentName: string;
  threadId: string;
  lastRunId: string;
  lastSeq: number;
  updatedAt: string;
}

export class OrgMemoryConsolidationStore {
  constructor(private readonly db: OrgSqliteDb) {}

  find(orgId: string, agentName: string, threadId: string): ConsolidationCursor | undefined {
    const row = this.db
      .select()
      .from(memoryConsolidationsTable)
      .where(
        and(
          eq(memoryConsolidationsTable.orgId, orgId),
          eq(memoryConsolidationsTable.agentName, agentName),
          eq(memoryConsolidationsTable.threadId, threadId),
        ),
      )
      .get();
    if (!row) {
      return undefined;
    }
    return {
      orgId: row.orgId,
      agentName: row.agentName,
      threadId: row.threadId,
      lastRunId: row.lastRunId,
      lastSeq: row.lastSeq,
      updatedAt: row.updatedAt,
    };
  }

  save(cursor: ConsolidationCursor): void {
    this.db
      .insert(memoryConsolidationsTable)
      .values({
        orgId: cursor.orgId,
        agentName: cursor.agentName,
        threadId: cursor.threadId,
        lastRunId: cursor.lastRunId,
        lastSeq: cursor.lastSeq,
        updatedAt: cursor.updatedAt,
      })
      .onConflictDoUpdate({
        target: [
          memoryConsolidationsTable.orgId,
          memoryConsolidationsTable.agentName,
          memoryConsolidationsTable.threadId,
        ],
        set: {
          lastRunId: cursor.lastRunId,
          lastSeq: cursor.lastSeq,
          updatedAt: cursor.updatedAt,
        },
      })
      .run();
  }
}
