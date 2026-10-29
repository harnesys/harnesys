import type { Agent } from '@/entities/agent';
import type { Webhook } from '@/entities/webhook';
import { dialog } from '@/shared/services/overlay';
import { WebhookConfigDialog } from '../ui/webhook-config-dialog';
import type { WebhookFormDraft } from './webhook-draft';
export type WebhookConfigResult =
  | { draft: WebhookFormDraft; deleted: false }
  | { draft: null; deleted: true };
export function openWebhookConfigDialog(agents: Agent[], projectId: string, webhook?: Webhook) {
  return dialog.open(WebhookConfigDialog, {
    title: webhook ? `Configure ${webhook.name}` : 'New webhook',
    className: 'sm:max-w-2xl',
    testId: 'webhook-config-dialog',
    data: { agents, projectId, webhook: webhook ?? null },
  });
}
