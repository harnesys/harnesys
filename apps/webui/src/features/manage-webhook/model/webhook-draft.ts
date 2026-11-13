import type { Agent } from '@/entities/agent';
import type { Webhook, WebhookStatus } from '@/entities/webhook';
export interface WebhookFormDraft {
  name: string;
  status: WebhookStatus;
  targetAgentId: string;
  detail: string;
  mode: string;
  threadId?: string;
}
export function draftFrom(item: Webhook): WebhookFormDraft {
  return {
    name: item.name,
    status: item.status,
    targetAgentId: item.targetAgentId,
    detail: item.detail,
    mode: item.mode,
    threadId: item.threadId,
  };
}
export function emptyWebhookDraft(agents: Agent[]): WebhookFormDraft {
  return {
    name: '',
    status: 'active',
    targetAgentId: agents[0]?.id ?? '',
    detail: '',
    mode: defaultWebhookMode(agents[0]),
    threadId: undefined,
  };
}
export function defaultWebhookMode(agent: Agent | undefined): string {
  return agent?.defaultModeId || 'ask';
}
