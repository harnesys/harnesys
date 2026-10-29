import type { WebhookStatus } from '@harnesys/contracts';

export interface WebhookRecord {
  id: string;
  orgId: string;
  name: string;
  status: WebhookStatus;
  targetAgentId: string;
  detail: string;
  endpoint: string;
  threadId: string;
  lastFiredAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WebhookInsert = WebhookRecord;

export type WebhookPatch = Partial<{
  name: string;
  status: WebhookStatus;
  targetAgentId: string;
  detail: string;
  endpoint: string;
  threadId: string;
  lastFiredAt: string | null;
  createdByUserId: string | null;
  updatedAt: string;
}>;

export type { WebhookStatus };
