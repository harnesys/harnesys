import { eq } from 'drizzle-orm';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runsTable } from '../org-sqlite/schema/index.ts';

export function runStatusOf(db: OrgSqliteDb, runId: string): string | undefined {
  return db
    .select({ status: runsTable.status })
    .from(runsTable)
    .where(eq(runsTable.runId, runId))
    .get()?.status;
}

export function runAgentIdOf(db: OrgSqliteDb, runId: string): string | undefined {
  return (
    db
      .select({ agentId: runsTable.agentId })
      .from(runsTable)
      .where(eq(runsTable.runId, runId))
      .get()?.agentId ?? undefined
  );
}
