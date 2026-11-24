import { SQLiteError } from 'bun:sqlite';
import { Injectable } from '@harnesys/brix';
import { and, eq } from 'drizzle-orm';
import { toDepartmentPublic } from '../../application/departments/department.helpers.ts';
import {
  DepartmentConflictException,
  DepartmentNotFoundException,
} from '../../domain/department/department.error.ts';
import type { DepartmentPatch, DepartmentRecord } from '../../domain/department/department.ts';
import { DepartmentRegistryPort } from '../../domain/department/department-registry.port.ts';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { departmentsTable } from '../org-sqlite/schema/index.ts';

@Injectable()
export class DepartmentRegistryAdapter extends DepartmentRegistryPort {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly deskEvents: DeskEventsPort,
  ) {
    super();
  }

  list(orgId: string): DepartmentRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(departmentsTable)
        .where(eq(departmentsTable.orgId, orgId))
        .all()
        .map(toRecord),
    );
  }

  findById(orgId: string, id: string): DepartmentRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(departmentsTable)
        .where(and(eq(departmentsTable.orgId, orgId), eq(departmentsTable.id, id)))
        .get();
      return row ? toRecord(row) : undefined;
    });
  }

  findByName(orgId: string, name: string): DepartmentRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(departmentsTable)
        .where(and(eq(departmentsTable.orgId, orgId), eq(departmentsTable.name, name)))
        .get();
      return row ? toRecord(row) : undefined;
    });
  }

  insert(rec: DepartmentRecord): DepartmentRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      try {
        const row = db.insert(departmentsTable).values(toInsert(rec)).returning().get();
        const record = toRecord(row);
        this.deskEvents.emit(rec.orgId, {
          type: 'department',
          department: toDepartmentPublic(record),
        });
        return record;
      } catch (err) {
        throw mapDepartmentSqliteError(err);
      }
    });
  }

  update(orgId: string, id: string, patch: DepartmentPatch): DepartmentRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      try {
        const existing = db
          .select()
          .from(departmentsTable)
          .where(and(eq(departmentsTable.orgId, orgId), eq(departmentsTable.id, id)))
          .get();
        if (!existing) {
          throw new DepartmentNotFoundException(id);
        }
        const merged = applyPatch(toRecord(existing), patch);
        const row = db
          .update(departmentsTable)
          .set(toInsert(merged))
          .where(and(eq(departmentsTable.orgId, orgId), eq(departmentsTable.id, id)))
          .returning()
          .get();
        if (!row) {
          throw new DepartmentNotFoundException(id);
        }
        const record = toRecord(row);
        this.deskEvents.emit(orgId, { type: 'department', department: toDepartmentPublic(record) });
        return record;
      } catch (err) {
        throw mapDepartmentSqliteError(err);
      }
    });
  }

  delete(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(departmentsTable)
        .where(and(eq(departmentsTable.orgId, orgId), eq(departmentsTable.id, id)))
        .run();
    });
    this.deskEvents.emit(orgId, { type: 'department-deleted', id });
  }
}

function toRecord(row: {
  id: string;
  orgId: string;
  name: string;
  parentId: string | null;
  leadAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}): DepartmentRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    parentId: row.parentId,
    leadAgentId: row.leadAgentId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toInsert(rec: DepartmentRecord) {
  return {
    id: rec.id,
    orgId: rec.orgId,
    name: rec.name,
    parentId: rec.parentId,
    leadAgentId: rec.leadAgentId,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

function applyPatch(current: DepartmentRecord, patch: DepartmentPatch): DepartmentRecord {
  return {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function mapDepartmentSqliteError(err: unknown): never {
  if (err instanceof DepartmentNotFoundException) {
    throw err;
  }
  if (err instanceof SQLiteError && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    throw new DepartmentConflictException('department name taken in org');
  }
  if (err instanceof SQLiteError && err.code === 'SQLITE_BUSY') {
    throw new DepartmentConflictException('database busy, retry');
  }
  throw err;
}
