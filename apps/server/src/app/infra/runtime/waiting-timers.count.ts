import { and, count, eq, isNotNull } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { runsTable } from '../org-sqlite/schema/index.ts';

export function countWaitingTimersOf(layout: HostFsLayoutPort, orgId: string): number {
  const row = withOrgSqlite(layout, orgId, (db) =>
    db
      .select({ value: count() })
      .from(runsTable)
      .where(and(eq(runsTable.status, 'waiting'), isNotNull(runsTable.waitFireAt)))
      .get(),
  );
  return row?.value ?? 0;
}
