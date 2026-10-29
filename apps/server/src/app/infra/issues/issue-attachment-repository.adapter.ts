import { Injectable } from '@harnesys/brix';
import { and, asc, count, eq } from 'drizzle-orm';
import type { IssueAttachmentRecord } from '../../domain/issue/issue.ts';
import {
  type IssueAttachmentCount,
  IssueAttachmentRepositoryPort,
} from '../../domain/issue/issue-attachment-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import type { IssueAttachmentRow } from '../org-sqlite/schema/index.ts';
import { issueAttachmentsTable } from '../org-sqlite/schema/index.ts';

@Injectable()
export class IssueAttachmentRepositoryAdapter extends IssueAttachmentRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listByIssue(orgId: string, issueId: string): IssueAttachmentRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(issueAttachmentsTable)
        .where(
          and(eq(issueAttachmentsTable.orgId, orgId), eq(issueAttachmentsTable.issueId, issueId)),
        )
        .orderBy(asc(issueAttachmentsTable.createdAt))
        .all()
        .map(toAttachment),
    );
  }

  countsByIssue(orgId: string): IssueAttachmentCount[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select({ issueId: issueAttachmentsTable.issueId, count: count() })
        .from(issueAttachmentsTable)
        .where(eq(issueAttachmentsTable.orgId, orgId))
        .groupBy(issueAttachmentsTable.issueId)
        .orderBy(issueAttachmentsTable.issueId)
        .all(),
    );
  }

  findById(
    orgId: string,
    issueId: string,
    attachmentId: string,
  ): IssueAttachmentRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(issueAttachmentsTable)
        .where(
          and(
            eq(issueAttachmentsTable.orgId, orgId),
            eq(issueAttachmentsTable.issueId, issueId),
            eq(issueAttachmentsTable.id, attachmentId),
          ),
        )
        .get();
      return row ? toAttachment(row) : undefined;
    });
  }

  insert(rec: IssueAttachmentRecord): IssueAttachmentRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      const row = db.insert(issueAttachmentsTable).values(rec).returning().get();
      return toAttachment(row);
    });
  }

  delete(orgId: string, issueId: string, attachmentId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(issueAttachmentsTable)
        .where(
          and(
            eq(issueAttachmentsTable.orgId, orgId),
            eq(issueAttachmentsTable.issueId, issueId),
            eq(issueAttachmentsTable.id, attachmentId),
          ),
        )
        .run();
    });
  }

  deleteByIssue(orgId: string, issueId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(issueAttachmentsTable)
        .where(
          and(eq(issueAttachmentsTable.orgId, orgId), eq(issueAttachmentsTable.issueId, issueId)),
        )
        .run();
    });
  }
}

function toAttachment(row: IssueAttachmentRow): IssueAttachmentRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    issueId: row.issueId,
    kind: row.kind,
    name: row.name,
    mediaType: row.mediaType,
    kindMedia: row.kindMedia,
    sizeBytes: row.sizeBytes,
    path: row.path,
    sourceId: row.sourceId,
    sourcePath: row.sourcePath,
    createdAt: row.createdAt,
  };
}
