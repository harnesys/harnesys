import { Injectable } from '@harnesys/brix';
import { and, eq, isNull } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  type CreateSourceOperationGrantInput,
  SourceOperationGrantPort,
  type SourceOperationGrantRecord,
} from '../../domain/source/source-operation-grant.port.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';
import { sourceOperationGrantsTable } from './schema/index.ts';

@Injectable()
export class SourceOperationGrantAdapter extends SourceOperationGrantPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  create(input: CreateSourceOperationGrantInput): void {
    withOrgSqlite(this.layout, input.orgId, (db) => {
      db.insert(sourceOperationGrantsTable)
        .values({
          operationId: input.operationId,
          orgId: input.orgId,
          nodeId: input.nodeId,
          sourceId: input.sourceId,
          credRef: input.credRef,
          expiresAt: input.expiresAt,
          consumedAt: null,
        })
        .run();
    });
  }

  consume(orgId: string, operationId: string, nodeId: string): SourceOperationGrantRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const now = new Date().toISOString();
      const row = db
        .select()
        .from(sourceOperationGrantsTable)
        .where(
          and(
            eq(sourceOperationGrantsTable.operationId, operationId),
            eq(sourceOperationGrantsTable.orgId, orgId),
            eq(sourceOperationGrantsTable.nodeId, nodeId),
            isNull(sourceOperationGrantsTable.consumedAt),
          ),
        )
        .get();
      if (!row || row.expiresAt <= now) {
        return null;
      }
      db.update(sourceOperationGrantsTable)
        .set({ consumedAt: now })
        .where(eq(sourceOperationGrantsTable.operationId, operationId))
        .run();
      return {
        operationId: row.operationId,
        orgId: row.orgId,
        nodeId: row.nodeId,
        sourceId: row.sourceId,
        credRef: row.credRef,
        expiresAt: row.expiresAt,
        consumedAt: now,
      };
    });
  }
}
