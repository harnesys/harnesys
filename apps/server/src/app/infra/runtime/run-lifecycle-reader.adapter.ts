import { Injectable } from '@harnesys/brix';
import { and, desc, eq } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  RunLifecycleReaderPort,
  type RunListFilter,
  type RunSummaryRecord,
} from '../../domain/thread/run-lifecycle-reader.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { runsTable } from '../org-sqlite/schema/index.ts';

@Injectable()
export class RunLifecycleReaderAdapter extends RunLifecycleReaderPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override listByThread(
    orgId: string,
    threadId: string,
    filter?: RunListFilter,
  ): Promise<RunSummaryRecord[]> {
    const rows = withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select({
          runId: runsTable.runId,
          status: runsTable.status,
          createdAt: runsTable.createdAt,
          agentId: runsTable.agentId,
        })
        .from(runsTable)
        .where(
          and(
            eq(runsTable.threadId, threadId),
            filter?.status !== undefined ? eq(runsTable.status, filter.status) : undefined,
          ),
        )
        .orderBy(desc(runsTable.createdAt))
        .all(),
    );
    return Promise.resolve(rows);
  }
}
