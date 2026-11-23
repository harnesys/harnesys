import { type SQL, sql } from 'drizzle-orm';
import { eventClaimsTable, runsTable } from '../org-sqlite/schema/index.ts';

export function notWorkerClaimedRun(): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${eventClaimsTable}
    WHERE ${eventClaimsTable.runId} = ${runsTable.runId}
      AND ${eventClaimsTable.doneAt} IS NULL
  )`;
}
