import type {
  AddonConnectionState,
  AutomationUpsertInput,
  IntegrationContext,
} from 'harnesys/integration';
import { listReaders, listRuleSourceIds, listRules } from './db/store.ts';

export function isReaderConnected(ctx: IntegrationContext): boolean {
  return listReaders(ctx.db).some((reader) => reader.status === 'authorized');
}

export function readerState(ctx: IntegrationContext): AddonConnectionState {
  const reader = listReaders(ctx.db).find((row) => row.status === 'authorized');
  if (!reader) {
    return { connected: false, label: 'Not connected' };
  }
  return {
    connected: true,
    label: reader.label,
    detail: `${reader.phoneMasked} · dc ${reader.dcId ?? '?'}`,
  };
}

export function syncAutomations(ctx: IntegrationContext): void {
  const connected = isReaderConnected(ctx);
  const items: AutomationUpsertInput[] = listRules(ctx.db).map((rule) => ({
    id: rule.id,
    kind: 'telegram.feed',
    label: rule.name,
    description: `${listRuleSourceIds(ctx.db, rule.id).length} source(s)`,
    status: rule.status,
    threadId: rule.threadId,
    targetAgentId: rule.agentId,
    meta: { filter: rule.filter.length === 0 ? 'all posts' : 'keywords' },
  }));
  ctx.automations.publish(items);
  ctx.events.emit({ kind: 'telegram.feed', action: connected ? 'changed' : 'removed' });
}
