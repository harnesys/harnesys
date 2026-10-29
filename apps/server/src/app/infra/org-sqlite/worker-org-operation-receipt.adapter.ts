import { Injectable } from '@harnesys/brix';
import { and, eq } from 'drizzle-orm';
import { WorkerOrgOperationReceiptPort } from '../../domain/fleet/worker-org-operation-receipt.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';
import { workerOrgOperationReceiptsTable } from './schema/index.ts';

@Injectable()
export class WorkerOrgOperationReceiptAdapter extends WorkerOrgOperationReceiptPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  find(orgId: string, runId: string, operationId: string): unknown | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(workerOrgOperationReceiptsTable)
        .where(
          and(
            eq(workerOrgOperationReceiptsTable.orgId, orgId),
            eq(workerOrgOperationReceiptsTable.runId, runId),
            eq(workerOrgOperationReceiptsTable.operationId, operationId),
          ),
        )
        .get();
      if (!row) {
        return null;
      }
      return JSON.parse(row.resultJson) as unknown;
    });
  }

  save(orgId: string, runId: string, operationId: string, result: unknown): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      const existing = db
        .select()
        .from(workerOrgOperationReceiptsTable)
        .where(
          and(
            eq(workerOrgOperationReceiptsTable.orgId, orgId),
            eq(workerOrgOperationReceiptsTable.runId, runId),
            eq(workerOrgOperationReceiptsTable.operationId, operationId),
          ),
        )
        .get();
      if (existing) {
        return;
      }
      db.insert(workerOrgOperationReceiptsTable)
        .values({
          orgId,
          runId,
          operationId,
          resultJson: JSON.stringify(result ?? null),
          createdAt: new Date().toISOString(),
        })
        .run();
    });
  }
}
