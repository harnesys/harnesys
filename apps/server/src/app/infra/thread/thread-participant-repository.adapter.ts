import { Injectable } from '@harnesys/brix';
import { and, eq } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import type {
  ThreadParticipantInsert,
  ThreadParticipantRecord,
  ThreadParticipantRole,
} from '../../domain/thread/thread.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { type ThreadParticipantRow, threadParticipantsTable } from '../org-sqlite/schema/index.ts';

function toRecord(row: ThreadParticipantRow): ThreadParticipantRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    threadId: row.threadId,
    provider: row.provider,
    providerUserId: row.providerUserId,
    displayName: row.displayName,
    username: row.username ?? null,
    role: row.role,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class ThreadParticipantRepositoryAdapter extends ThreadParticipantRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listByThread(orgId: string, threadId: string): ThreadParticipantRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(threadParticipantsTable)
        .where(eq(threadParticipantsTable.threadId, threadId))
        .all()
        .map(toRecord),
    );
  }

  findById(orgId: string, threadId: string, id: string): ThreadParticipantRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(threadParticipantsTable)
        .where(
          and(eq(threadParticipantsTable.threadId, threadId), eq(threadParticipantsTable.id, id)),
        )
        .get();
      return row ? toRecord(row) : undefined;
    });
  }

  findByUserId(
    orgId: string,
    threadId: string,
    userId: string,
  ): ThreadParticipantRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(threadParticipantsTable)
        .where(
          and(
            eq(threadParticipantsTable.threadId, threadId),
            eq(threadParticipantsTable.provider, 'app'),
            eq(threadParticipantsTable.providerUserId, userId),
          ),
        )
        .get();
      return row ? toRecord(row) : undefined;
    });
  }

  ensure(rec: ThreadParticipantInsert): ThreadParticipantRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      db.insert(threadParticipantsTable)
        .values({
          id: rec.id,
          orgId: rec.orgId,
          threadId: rec.threadId,
          provider: rec.provider,
          providerUserId: rec.providerUserId,
          displayName: rec.displayName,
          username: rec.username ?? null,
          role: rec.role ?? 'member',
          firstSeenAt: rec.firstSeenAt,
          lastSeenAt: rec.lastSeenAt ?? null,
          createdAt: rec.createdAt,
          updatedAt: rec.updatedAt,
        })
        .onConflictDoNothing()
        .run();
      const row = db
        .select()
        .from(threadParticipantsTable)
        .where(
          and(
            eq(threadParticipantsTable.threadId, rec.threadId),
            eq(threadParticipantsTable.provider, rec.provider),
            eq(threadParticipantsTable.providerUserId, rec.providerUserId),
          ),
        )
        .get();
      if (!row) {
        throw new ThreadValidationException(`thread participant not stored: ${rec.providerUserId}`);
      }
      return toRecord(row);
    });
  }

  setRole(orgId: string, threadId: string, id: string, role: ThreadParticipantRole): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.update(threadParticipantsTable)
        .set({ role, updatedAt: new Date().toISOString() })
        .where(
          and(eq(threadParticipantsTable.threadId, threadId), eq(threadParticipantsTable.id, id)),
        )
        .run();
    });
  }

  touchSeen(orgId: string, threadId: string, providerUserId: string, at: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.update(threadParticipantsTable)
        .set({ lastSeenAt: at, updatedAt: at })
        .where(
          and(
            eq(threadParticipantsTable.threadId, threadId),
            eq(threadParticipantsTable.provider, 'app'),
            eq(threadParticipantsTable.providerUserId, providerUserId),
          ),
        )
        .run();
    });
  }

  remove(orgId: string, threadId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(threadParticipantsTable)
        .where(
          and(eq(threadParticipantsTable.threadId, threadId), eq(threadParticipantsTable.id, id)),
        )
        .run();
    });
  }

  countByThread(orgId: string, threadId: string): number {
    return this.listByThread(orgId, threadId).length;
  }

  requireParticipant(
    orgId: string,
    threadId: string,
    id: string,
  ): ThreadParticipantRecord | undefined {
    const found = this.findById(orgId, threadId, id);
    if (!found) {
      throw new ThreadNotFoundException(`${threadId}:${id}`);
    }
    return found;
  }
}
