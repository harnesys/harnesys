import { Injectable } from '@harnesys/brix';
import { and, eq } from 'drizzle-orm';
import type {
  IssueLabelInsert,
  IssueLabelPatch,
  IssueLabelRecord,
} from '../../domain/issue/label.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import type { IssueLabelRow } from '../org-sqlite/schema/index.ts';
import {
  issueLabelsTable,
  type IssueLabelInsert as LabelInsertRow,
} from '../org-sqlite/schema/index.ts';

@Injectable()
export class IssueLabelRepositoryAdapter extends IssueLabelRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listByOrg(orgId: string): IssueLabelRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(issueLabelsTable)
        .where(eq(issueLabelsTable.orgId, orgId))
        .all()
        .map(toLabel),
    );
  }

  findById(orgId: string, id: string): IssueLabelRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(issueLabelsTable)
        .where(and(eq(issueLabelsTable.orgId, orgId), eq(issueLabelsTable.id, id)))
        .get();
      return row ? toLabel(row) : undefined;
    });
  }

  insert(rec: IssueLabelInsert): IssueLabelRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      const row = db.insert(issueLabelsTable).values(toLabelRow(rec)).returning().get();
      return toLabel(row);
    });
  }

  update(orgId: string, id: string, patch: IssueLabelPatch): IssueLabelRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .update(issueLabelsTable)
        .set(patch)
        .where(and(eq(issueLabelsTable.orgId, orgId), eq(issueLabelsTable.id, id)))
        .returning()
        .get();
      return toLabel(row);
    });
  }

  delete(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(issueLabelsTable)
        .where(and(eq(issueLabelsTable.orgId, orgId), eq(issueLabelsTable.id, id)))
        .run();
    });
  }
}

function toLabel(row: IssueLabelRow): IssueLabelRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    title: row.title,
    color: row.color,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLabelRow(rec: IssueLabelInsert): LabelInsertRow {
  return {
    id: rec.id,
    orgId: rec.orgId,
    title: rec.title,
    color: rec.color,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}
