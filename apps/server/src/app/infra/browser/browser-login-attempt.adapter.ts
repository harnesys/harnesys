import { Injectable } from '@harnesys/brix';
import { and, desc, eq } from 'drizzle-orm';
import {
  AttemptExpiredException,
  AttemptTopologyException,
} from '../../domain/browser/browser-credential.error.ts';
import type { BrowserLoginAttemptInput } from '../../domain/browser/login-attempt.port.ts';
import {
  BrowserLoginAttemptPort,
  type BrowserLoginAttemptRef,
  type BrowserLoginAttemptStart,
  type BrowserLoginAttemptSubmit,
} from '../../domain/browser/login-attempt.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { browserLoginAttemptsTable } from '../org-sqlite/schema/browser-login-attempts.ts';

const ATTEMPT_TTL_MS = 5 * 60_000;

@Injectable()
export class BrowserLoginAttemptAdapter extends BrowserLoginAttemptPort {
  private readonly buffers = new Map<
    string,
    { input: BrowserLoginAttemptInput; expiresAt: number }
  >();
  private readonly kinds = new Map<string, 'challenge' | 'manual'>();

  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  async start(input: BrowserLoginAttemptStart): Promise<BrowserLoginAttemptRef> {
    const now = new Date();
    const attemptId = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + ATTEMPT_TTL_MS);
    this.kinds.set(attemptId, input.kind);
    withOrgSqlite(this.layout, input.orgId, (db) => {
      db.insert(browserLoginAttemptsTable)
        .values({
          id: attemptId,
          credentialId: input.credentialId,
          runId: input.runId,
          threadId: input.threadId,
          status: 'waiting',
          expiresAt: expiresAt.toISOString(),
          createdAt: now.toISOString(),
        })
        .run();
    });
    return { attemptId, kind: input.kind, expiresAt: expiresAt.toISOString() };
  }

  async active(
    orgId: string,
    credentialId: string,
    threadId?: string | null,
  ): Promise<BrowserLoginAttemptRef | null> {
    const filters = [
      eq(browserLoginAttemptsTable.credentialId, credentialId),
      eq(browserLoginAttemptsTable.status, 'waiting'),
    ];
    if (threadId !== undefined && threadId !== null && threadId !== '') {
      filters.push(eq(browserLoginAttemptsTable.threadId, threadId));
    }
    const row = withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(browserLoginAttemptsTable)
        .where(and(...filters))
        .orderBy(desc(browserLoginAttemptsTable.createdAt))
        .limit(1)
        .get(),
    );
    if (!row || Date.parse(row.expiresAt) <= Date.now()) {
      return null;
    }
    return {
      attemptId: row.id,
      kind: this.kinds.get(row.id) ?? 'challenge',
      expiresAt: row.expiresAt,
    };
  }

  async takeInput(orgId: string, attemptId: string): Promise<BrowserLoginAttemptInput | null> {
    const buffer = this.buffers.get(attemptId);
    if (!buffer) {
      const row = this.rowOf(orgId, attemptId);
      if (!row) {
        return null;
      }
      if (Date.parse(row.expiresAt) <= Date.now()) {
        this.markExpired(orgId, attemptId);
        return null;
      }
      throw new AttemptTopologyException();
    }
    if (buffer.expiresAt <= Date.now()) {
      this.buffers.delete(attemptId);
      this.markExpired(orgId, attemptId);
      return null;
    }
    return buffer.input;
  }

  async complete(orgId: string, attemptId: string): Promise<void> {
    this.buffers.delete(attemptId);
    this.kinds.delete(attemptId);
    withOrgSqlite(this.layout, orgId, (db) => {
      db.update(browserLoginAttemptsTable)
        .set({ status: 'completed' })
        .where(eq(browserLoginAttemptsTable.id, attemptId))
        .run();
    });
  }

  async submit(input: BrowserLoginAttemptSubmit): Promise<{ accepted: boolean }> {
    const row = this.rowOf(input.orgId, input.attemptId);
    if (!row || row.credentialId !== input.credentialId) {
      return { accepted: false };
    }
    if (Date.parse(row.expiresAt) <= Date.now() || row.status !== 'waiting') {
      throw new AttemptExpiredException(input.attemptId);
    }
    this.buffers.set(input.attemptId, {
      input: input.input,
      expiresAt: Date.parse(row.expiresAt),
    });
    return { accepted: true };
  }

  private rowOf(orgId: string, attemptId: string) {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(browserLoginAttemptsTable)
        .where(eq(browserLoginAttemptsTable.id, attemptId))
        .get(),
    );
  }

  private markExpired(orgId: string, attemptId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.update(browserLoginAttemptsTable)
        .set({ status: 'expired' })
        .where(eq(browserLoginAttemptsTable.id, attemptId))
        .run();
    });
  }
}
