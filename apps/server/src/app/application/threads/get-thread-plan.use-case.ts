import { Injectable } from '@harnesys/brix';
import type { ThreadPlanRecord } from '@harnesys/studio-shared';
import { eq } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../../infra/org-sqlite/org-sqlite-session.ts';
import { threadPlansTable } from '../../infra/org-sqlite/schema/thread-plans.ts';
import { snapshotOfRow } from './thread-plan.helpers.ts';

export interface GetThreadPlanRequest {
  orgId: string;
  threadId: string;
}

@Injectable()
export class GetThreadPlanUseCase {
  constructor(private readonly layout: HostFsLayoutPort) {}

  execute(request: GetThreadPlanRequest): Promise<ThreadPlanRecord | null> {
    return Promise.resolve(
      withOrgSqlite(this.layout, request.orgId, (db) => {
        const row = db
          .select()
          .from(threadPlansTable)
          .where(eq(threadPlansTable.threadId, request.threadId))
          .get();
        return row ? snapshotOfRow(row) : null;
      }),
    );
  }
}
