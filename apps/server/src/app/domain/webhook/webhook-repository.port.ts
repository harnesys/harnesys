import type { WebhookInsert, WebhookPatch, WebhookRecord } from './webhook.ts';

export abstract class WebhookRepositoryPort {
  abstract listByOrg(orgId: string): WebhookRecord[];
  abstract findById(orgId: string, id: string): WebhookRecord | undefined;
  abstract findByThreadId(orgId: string, threadId: string): WebhookRecord | undefined;
  abstract insert(rec: WebhookInsert): WebhookRecord;
  abstract update(orgId: string, id: string, patch: WebhookPatch): WebhookRecord;
  abstract delete(orgId: string, id: string): void;
}
