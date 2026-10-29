import { Injectable } from '@harnesys/brix';
import { and, eq } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type {
  AttachmentInsert,
  AttachmentKind,
  AttachmentRecord,
} from '../../domain/thread/attachment.ts';
import { AttachmentRepositoryPort } from '../../domain/thread/attachment-repository.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { type AttachmentRow, attachmentsTable } from '../org-sqlite/schema/index.ts';

@Injectable()
export class AttachmentRepositoryAdapter extends AttachmentRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listByThread(orgId: string, threadId: string): AttachmentRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(attachmentsTable)
        .where(and(eq(attachmentsTable.threadId, threadId)))
        .orderBy(attachmentsTable.createdAt)
        .all()
        .map(toAttachment),
    );
  }

  findById(orgId: string, id: string): AttachmentRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db.select().from(attachmentsTable).where(eq(attachmentsTable.id, id)).get();
      return row ? toAttachment(row) : undefined;
    });
  }

  insert(orgId: string, rec: AttachmentInsert): AttachmentRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .insert(attachmentsTable)
        .values({
          id: rec.id,
          threadId: rec.threadId,
          name: rec.name,
          mediaType: rec.mediaType,
          kind: rec.kind,
          sizeBytes: rec.sizeBytes,
          path: rec.path ?? null,
          createdAt: rec.createdAt,
        })
        .returning()
        .get();
      return toAttachment(row);
    });
  }

  removeByThread(orgId: string, threadId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(attachmentsTable).where(eq(attachmentsTable.threadId, threadId)).run();
    });
  }
}

function toAttachment(row: AttachmentRow): AttachmentRecord {
  return {
    id: row.id,
    threadId: row.threadId,
    name: row.name,
    mediaType: row.mediaType,
    kind: row.kind as AttachmentKind,
    sizeBytes: row.sizeBytes,
    path: row.path ?? null,
    createdAt: row.createdAt,
  };
}
