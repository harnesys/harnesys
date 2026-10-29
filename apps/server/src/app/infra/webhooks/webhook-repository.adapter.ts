import { Injectable } from '@harnesys/brix';
import type { WebhookStatus } from '@harnesys/contracts';
import { and, eq } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  WebhookNotFoundException,
  WebhookValidationException,
} from '../../domain/webhook/webhook.error.ts';
import type { WebhookInsert, WebhookPatch, WebhookRecord } from '../../domain/webhook/webhook.ts';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { type WebhookRow, webhooksTable } from '../org-sqlite/schema/index.ts';

@Injectable()
export class WebhookRepositoryAdapter extends WebhookRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listByOrg(orgId: string): WebhookRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.select().from(webhooksTable).where(eq(webhooksTable.orgId, orgId)).all().map(toWebhook),
    );
  }

  findById(orgId: string, id: string): WebhookRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(webhooksTable)
        .where(and(eq(webhooksTable.orgId, orgId), eq(webhooksTable.id, id)))
        .get();
      return row ? toWebhook(row) : undefined;
    });
  }

  findByThreadId(orgId: string, threadId: string): WebhookRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(webhooksTable)
        .where(and(eq(webhooksTable.orgId, orgId), eq(webhooksTable.threadId, threadId)))
        .get();
      return row ? toWebhook(row) : undefined;
    });
  }

  insert(rec: WebhookInsert): WebhookRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      try {
        const row = db
          .insert(webhooksTable)
          .values({
            id: rec.id,
            orgId: rec.orgId,
            name: rec.name,
            status: rec.status,
            targetAgentId: rec.targetAgentId,
            detail: rec.detail,
            endpoint: rec.endpoint,
            threadId: rec.threadId,
            lastFiredAt: rec.lastFiredAt,
            createdByUserId: rec.createdByUserId,
            createdAt: rec.createdAt,
            updatedAt: rec.updatedAt,
          })
          .returning()
          .get();
        return toWebhook(row);
      } catch (err) {
        throw mapWebhookSqliteError(err);
      }
    });
  }

  update(orgId: string, id: string, patch: WebhookPatch): WebhookRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      try {
        const row = db
          .update(webhooksTable)
          .set(patch)
          .where(and(eq(webhooksTable.orgId, orgId), eq(webhooksTable.id, id)))
          .returning()
          .get();
        if (!row) {
          throw new WebhookNotFoundException(id);
        }
        return toWebhook(row);
      } catch (err) {
        if (err instanceof WebhookNotFoundException) {
          throw err;
        }
        throw mapWebhookSqliteError(err);
      }
    });
  }

  delete(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(webhooksTable)
        .where(and(eq(webhooksTable.orgId, orgId), eq(webhooksTable.id, id)))
        .run();
    });
  }
}

function toWebhook(row: WebhookRow): WebhookRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    status: row.status as WebhookStatus,
    targetAgentId: row.targetAgentId,
    detail: row.detail,
    endpoint: row.endpoint,
    threadId: row.threadId,
    lastFiredAt: row.lastFiredAt,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapWebhookSqliteError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('UNIQUE') && message.includes('thread')) {
    throw new WebhookValidationException('thread already has a webhook');
  }
  if (message.includes('FOREIGN KEY') || message.includes('constraint')) {
    throw new WebhookValidationException('invalid webhook reference');
  }
  throw err instanceof Error ? err : new Error(message);
}
