import { Injectable } from '@harnesys/brix';
import { and, eq, or } from 'drizzle-orm';
import type { IssueDependencyInsert, IssueDependencyRecord } from '../../domain/issue/issue.ts';
import { IssueDependencyRepositoryPort } from '../../domain/issue/issue-dependency-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { issueDependenciesTable } from '../org-sqlite/schema/index.ts';

@Injectable()
export class IssueDependencyRepositoryAdapter extends IssueDependencyRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listByIssue(orgId: string, issueId: string): IssueDependencyRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(issueDependenciesTable)
        .where(
          and(eq(issueDependenciesTable.orgId, orgId), eq(issueDependenciesTable.issueId, issueId)),
        )
        .all()
        .map(toDependency),
    );
  }

  listDependents(orgId: string, issueId: string): IssueDependencyRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(issueDependenciesTable)
        .where(
          and(
            eq(issueDependenciesTable.orgId, orgId),
            eq(issueDependenciesTable.dependsOnIssueId, issueId),
          ),
        )
        .all()
        .map(toDependency),
    );
  }

  listAll(orgId: string): IssueDependencyRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(issueDependenciesTable)
        .where(eq(issueDependenciesTable.orgId, orgId))
        .all()
        .map(toDependency),
    );
  }

  insert(rec: IssueDependencyInsert): IssueDependencyRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      const row = db.insert(issueDependenciesTable).values(rec).returning().get();
      return toDependency(row);
    });
  }

  delete(orgId: string, issueId: string, dependsOnIssueId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(issueDependenciesTable)
        .where(
          and(
            eq(issueDependenciesTable.orgId, orgId),
            or(
              and(
                eq(issueDependenciesTable.issueId, issueId),
                eq(issueDependenciesTable.dependsOnIssueId, dependsOnIssueId),
              ),
              and(
                eq(issueDependenciesTable.issueId, dependsOnIssueId),
                eq(issueDependenciesTable.dependsOnIssueId, issueId),
              ),
            ),
          ),
        )
        .run();
    });
  }
}

function toDependency(row: typeof issueDependenciesTable.$inferSelect): IssueDependencyRecord {
  return {
    orgId: row.orgId,
    issueId: row.issueId,
    dependsOnIssueId: row.dependsOnIssueId,
    type: row.type,
    createdAt: row.createdAt,
  };
}
