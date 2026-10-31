import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import { and, desc, eq } from 'drizzle-orm';
import type { PermissionGrantRecord } from '../../domain/approval/permission-grant-store.port.ts';
import {
  PermissionGrantStorePort,
  type PermissionGrantWriteInput,
} from '../../domain/approval/permission-grant-store.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import {
  type PermissionGrantRow,
  permissionGrantsTable,
} from '../org-sqlite/schema/permission-grants.ts';

@Injectable()
export class PermissionGrantStoreAdapter extends PermissionGrantStorePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  record(orgId: string, input: PermissionGrantWriteInput): PermissionGrantRecord {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.transaction((tx): PermissionGrantRecord => {
        const existing = tx
          .select()
          .from(permissionGrantsTable)
          .where(
            and(
              eq(permissionGrantsTable.agentId, input.agentId),
              eq(permissionGrantsTable.operation, input.operation),
            ),
          )
          .get();
        if (existing) {
          return rowToRecord(existing);
        }
        const row = {
          id: randomUUID(),
          orgId,
          agentId: input.agentId,
          operation: input.operation,
          ...(input.decidedBy !== undefined ? { decidedBy: input.decidedBy } : {}),
          createdAt: new Date().toISOString(),
        };
        tx.insert(permissionGrantsTable).values(row).run();
        return rowToRecord(row as PermissionGrantRow);
      }),
    );
  }

  has(orgId: string, agentId: string, operation: string): boolean {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select({ id: permissionGrantsTable.id })
        .from(permissionGrantsTable)
        .where(
          and(
            eq(permissionGrantsTable.agentId, agentId),
            eq(permissionGrantsTable.operation, operation),
          ),
        )
        .get();
      return row !== undefined;
    });
  }

  list(orgId: string, agentId?: string): PermissionGrantRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const rows = db
        .select()
        .from(permissionGrantsTable)
        .where(agentId === undefined ? undefined : eq(permissionGrantsTable.agentId, agentId))
        .orderBy(desc(permissionGrantsTable.createdAt))
        .all();
      return rows.map(rowToRecord);
    });
  }

  revoke(orgId: string, grantId: string): boolean {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const deleted = db
        .delete(permissionGrantsTable)
        .where(eq(permissionGrantsTable.id, grantId))
        .returning({ id: permissionGrantsTable.id })
        .all();
      return deleted.length > 0;
    });
  }
}

function rowToRecord(row: PermissionGrantRow): PermissionGrantRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    agentId: row.agentId,
    operation: row.operation,
    decidedBy: row.decidedBy ?? null,
    createdAt: row.createdAt,
  };
}
