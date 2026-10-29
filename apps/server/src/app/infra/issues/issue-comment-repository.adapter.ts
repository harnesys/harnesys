import { Injectable } from '@harnesys/brix';
import { and, asc, count, eq } from 'drizzle-orm';
import type { IssueCommentInsert, IssueCommentRecord } from '../../domain/issue/issue.ts';
import {
  type IssueCommentCount,
  IssueCommentRepositoryPort,
} from '../../domain/issue/issue-comment-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import type {
  IssueCommentInsert as CommentInsertRow,
  IssueCommentRow,
} from '../org-sqlite/schema/index.ts';
import { issueCommentsTable } from '../org-sqlite/schema/index.ts';

@Injectable()
export class IssueCommentRepositoryAdapter extends IssueCommentRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listByIssue(orgId: string, issueId: string): IssueCommentRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(issueCommentsTable)
        .where(and(eq(issueCommentsTable.orgId, orgId), eq(issueCommentsTable.issueId, issueId)))
        .orderBy(asc(issueCommentsTable.createdAt))
        .all()
        .map(toComment),
    );
  }

  countsByIssue(orgId: string): IssueCommentCount[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select({ issueId: issueCommentsTable.issueId, count: count() })
        .from(issueCommentsTable)
        .where(eq(issueCommentsTable.orgId, orgId))
        .groupBy(issueCommentsTable.issueId)
        .orderBy(issueCommentsTable.issueId)
        .all(),
    );
  }

  insert(rec: IssueCommentInsert): IssueCommentRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      const row = db.insert(issueCommentsTable).values(toRow(rec)).returning().get();
      return toComment(row);
    });
  }

  deleteByIssue(orgId: string, issueId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(issueCommentsTable)
        .where(and(eq(issueCommentsTable.orgId, orgId), eq(issueCommentsTable.issueId, issueId)))
        .run();
    });
  }
}

function toComment(row: IssueCommentRow): IssueCommentRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    issueId: row.issueId,
    authorType: row.authorType,
    authorAgentId: row.authorAgentId,
    body: row.body,
    createdAt: row.createdAt,
  };
}

function toRow(rec: IssueCommentInsert): CommentInsertRow {
  return {
    id: rec.id,
    orgId: rec.orgId,
    issueId: rec.issueId,
    authorType: rec.authorType,
    authorAgentId: rec.authorAgentId,
    body: rec.body,
    createdAt: rec.createdAt,
  };
}
