import { Injectable } from '@harnesys/brix';
import { and, eq, inArray } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';
import type { ThreadAgentRecord } from '../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { type OrgSqliteDb, withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { type ThreadAgentRow, threadAgentsTable } from '../org-sqlite/schema/index.ts';

function toRecord(row: ThreadAgentRow): ThreadAgentRecord {
  return {
    threadId: row.threadId,
    agentId: row.agentId,
    createdAt: row.createdAt,
  };
}

function listRows(db: OrgSqliteDb, threadIds: string[]): ThreadAgentRow[] {
  if (threadIds.length === 0) {
    return [];
  }
  return db
    .select()
    .from(threadAgentsTable)
    .where(inArray(threadAgentsTable.threadId, threadIds))
    .all();
}

@Injectable()
export class ThreadAgentRepositoryAdapter extends ThreadAgentRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listByThread(orgId: string, threadId: string): ThreadAgentRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => listRows(db, [threadId]).map(toRecord));
  }

  listByThreads(orgId: string, threadIds: string[]): ThreadAgentRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => listRows(db, threadIds).map(toRecord));
  }

  ensure(orgId: string, threadId: string, agentId: string): ThreadAgentRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      db.insert(threadAgentsTable)
        .values({ threadId, agentId, createdAt: new Date().toISOString() })
        .onConflictDoNothing()
        .run();
      const row = db
        .select()
        .from(threadAgentsTable)
        .where(
          and(eq(threadAgentsTable.threadId, threadId), eq(threadAgentsTable.agentId, agentId)),
        )
        .get();
      if (!row) {
        throw new ThreadValidationException(`thread not found: ${threadId}`);
      }
      return toRecord(row);
    });
  }

  remove(orgId: string, threadId: string, agentId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(threadAgentsTable)
        .where(
          and(eq(threadAgentsTable.threadId, threadId), eq(threadAgentsTable.agentId, agentId)),
        )
        .run();
    });
  }

  listThreadIdsByAgent(orgId: string, agentId: string): string[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select({ threadId: threadAgentsTable.threadId })
        .from(threadAgentsTable)
        .where(eq(threadAgentsTable.agentId, agentId))
        .all()
        .map((row) => row.threadId),
    );
  }
}
