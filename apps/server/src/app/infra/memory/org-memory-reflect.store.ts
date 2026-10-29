import { and, eq } from 'drizzle-orm';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { memoryReflectsTable } from '../org-sqlite/schema/agent-memory.ts';

export class OrgMemoryReflectStore {
  constructor(private readonly db: OrgSqliteDb) {}

  find(orgId: string, agentName: string): string | undefined {
    const row = this.db
      .select()
      .from(memoryReflectsTable)
      .where(
        and(eq(memoryReflectsTable.orgId, orgId), eq(memoryReflectsTable.agentName, agentName)),
      )
      .get();
    return row?.lastReflectedAt;
  }

  save(orgId: string, agentName: string, at: string): void {
    this.db
      .insert(memoryReflectsTable)
      .values({ orgId, agentName, lastReflectedAt: at })
      .onConflictDoUpdate({
        target: [memoryReflectsTable.orgId, memoryReflectsTable.agentName],
        set: { lastReflectedAt: at },
      })
      .run();
  }
}
