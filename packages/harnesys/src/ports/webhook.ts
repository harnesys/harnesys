import type { CapabilityScope } from '../domain/pack.ts';
import type { RunLifecycleStatus } from './run-lifecycle-store.ts';
import type { SessionEvent } from './session.ts';
export type WebhookStatus = 'active' | 'paused' | 'failed';
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
  createdAt: string;
  updatedAt: string;
}
export interface WebhookCreateInput {
  name: string;
  targetAgentId?: string;
  detail?: string;
  status?: WebhookStatus;
}
export interface WebhookUpdateInput {
  name?: string;
  status?: WebhookStatus;
  targetAgentId?: string;
  detail?: string;
}
export interface WebhookThreadActiveRun {
  runId: string;
  status: RunLifecycleStatus;
  leaseExpired?: boolean;
}
export interface WebhookCreatedThread {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  orgId: string;
  kind: string;
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
  unread: boolean;
  events: SessionEvent[];
  activeRun: WebhookThreadActiveRun | null;
}
export interface WebhookCreatedRecord {
  webhook: WebhookRecord;
  thread: WebhookCreatedThread;
}
export interface WebhookPort {
  list(scope: CapabilityScope): Promise<WebhookRecord[]>;
  create(scope: CapabilityScope, input: WebhookCreateInput): Promise<WebhookCreatedRecord>;
  update(scope: CapabilityScope, id: string, patch: WebhookUpdateInput): Promise<WebhookRecord>;
  remove(scope: CapabilityScope, id: string): Promise<void>;
}
