import { Injectable } from '@harnesys/brix';
import { eq } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../../infra/org-sqlite/org-sqlite-session.ts';
import { threadPlansTable } from '../../infra/org-sqlite/schema/thread-plans.ts';

export interface DeleteThreadPlanRequest {
  orgId: string;
  threadId: string;
}

@Injectable()
export class DeleteThreadPlanUseCase {
  constructor(private readonly layout: HostFsLayoutPort) {}

  execute(request: DeleteThreadPlanRequest): Promise<void> {
    return Promise.resolve(
      withOrgSqlite(this.layout, request.orgId, (db) => {
        db.delete(threadPlansTable).where(eq(threadPlansTable.threadId, request.threadId)).run();
      }),
    );
  }
}
