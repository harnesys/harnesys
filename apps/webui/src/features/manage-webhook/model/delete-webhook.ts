import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useWebhookStore, type Webhook } from '@/entities/webhook';
import { deleteWebhookRecord } from '@/shared/api';
import { alert } from '@/shared/services/overlay';
export function confirmDeleteWebhook(webhook: Webhook) {
  return alert.confirm({
    title: `Delete ${webhook.name}?`,
    description: 'This webhook will be removed from the project.',
    confirmText: 'Delete webhook',
    variant: 'destructive',
    testId: 'delete-webhook-dialog',
  });
}
export async function deleteWebhook(projectId: string, webhook: Webhook): Promise<boolean> {
  await deleteWebhookRecord(projectId, webhook.id);
  useWebhookStore.getState().remove(webhook.id);
  const thread = useThreadStore.getState().byId(webhook.threadId);
  if (thread?.kind === 'webhook') {
    useSessionStore.getState().removeForThreads([webhook.threadId]);
    useThreadStore.getState().remove(webhook.threadId);
    return true;
  }
  return false;
}
