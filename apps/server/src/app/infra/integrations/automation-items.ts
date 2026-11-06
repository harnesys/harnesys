import type { AutomationConnection, AutomationItem, AutomationKind } from '@harnesys/contracts';
import type { AutomationUpsertInput, IntegrationDefinition } from 'harnesys/integration';
import type { ScheduleRecord } from '../../domain/schedule/schedule.ts';
import type { WebhookRecord } from '../../domain/webhook/webhook.ts';

export const CORE_INTEGRATION_ID = 'core';
export const CORE_SCHEDULE_KIND = 'schedule';
export const CORE_WEBHOOK_KIND = 'webhook';

export const CORE_AUTOMATION_KINDS: AutomationKind[] = [
  {
    kind: CORE_SCHEDULE_KIND,
    integrationId: CORE_INTEGRATION_ID,
    label: 'Scheduler',
    description: 'Cron schedule',
    icon: 'calendar-clock',
    requiresConnection: false,
    connected: true,
  },
  {
    kind: CORE_WEBHOOK_KIND,
    integrationId: CORE_INTEGRATION_ID,
    label: 'Webhook',
    description: 'HTTP trigger',
    icon: 'webhook',
    requiresConnection: false,
    connected: true,
  },
];

export interface AutomationSnapshotSource {
  integrationId: string;
  connection: AutomationConnection;
  items: AutomationUpsertInput[];
}

export interface MergeAutomationInput {
  orgId: string;
  schedules: ScheduleRecord[];
  webhooks: WebhookRecord[];
  addons: AutomationSnapshotSource[];
}

export class AutomationSnapshots {
  private readonly byOrg = new Map<string, Map<string, AutomationUpsertInput[]>>();

  publish(orgId: string, integrationId: string, items: AutomationUpsertInput[]): void {
    let byIntegration = this.byOrg.get(orgId);
    if (!byIntegration) {
      byIntegration = new Map();
      this.byOrg.set(orgId, byIntegration);
    }
    byIntegration.set(integrationId, items);
  }

  forOrg(orgId: string): Array<{ integrationId: string; items: AutomationUpsertInput[] }> {
    const byIntegration = this.byOrg.get(orgId);
    if (!byIntegration) {
      return [];
    }
    return [...byIntegration.entries()].map(([integrationId, items]) => ({
      integrationId,
      items,
    }));
  }

  clear(): void {
    this.byOrg.clear();
  }
}

export function mergeAutomationItems(input: MergeAutomationInput): AutomationItem[] {
  const items: AutomationItem[] = [
    ...input.schedules.map(toScheduleAutomationItem),
    ...input.webhooks.map(toWebhookAutomationItem),
  ];
  for (const source of input.addons) {
    for (const snapshot of source.items) {
      items.push(
        toAddonAutomationItem(input.orgId, source.integrationId, snapshot, source.connection),
      );
    }
  }
  return items;
}

export function toScheduleAutomationItem(schedule: ScheduleRecord): AutomationItem {
  return {
    id: schedule.id,
    orgId: schedule.orgId,
    integrationId: CORE_INTEGRATION_ID,
    kind: CORE_SCHEDULE_KIND,
    label: schedule.name,
    description: schedule.detail,
    status: schedule.status,
    threadId: schedule.threadId,
    targetAgentId: schedule.targetAgentId,
    connection: { required: false, connected: true },
    meta: metaOf({ cron: schedule.cron, nextRunAt: schedule.nextRunAt }),
    availableAt: schedule.nextRunAt,
    updatedAt: schedule.updatedAt,
  };
}

export function toWebhookAutomationItem(webhook: WebhookRecord): AutomationItem {
  return {
    id: webhook.id,
    orgId: webhook.orgId,
    integrationId: CORE_INTEGRATION_ID,
    kind: CORE_WEBHOOK_KIND,
    label: webhook.name,
    description: webhook.detail,
    status: webhook.status,
    threadId: webhook.threadId,
    targetAgentId: webhook.targetAgentId,
    connection: { required: false, connected: true },
    meta: metaOf({ endpoint: webhook.endpoint }),
    availableAt: null,
    updatedAt: webhook.updatedAt,
  };
}

export function toAddonAutomationItem(
  orgId: string,
  integrationId: string,
  item: AutomationUpsertInput,
  connection: AutomationConnection,
): AutomationItem {
  return {
    id: item.id,
    orgId,
    integrationId,
    kind: item.kind,
    label: item.label,
    description: item.description ?? '',
    status: item.status,
    threadId: item.threadId ?? null,
    targetAgentId: item.targetAgentId ?? null,
    connection,
    meta: item.meta ?? {},
    availableAt: item.availableAt ?? null,
    updatedAt: item.updatedAt ?? new Date().toISOString(),
  };
}

export function toAutomationKindContributions(definition: IntegrationDefinition): AutomationKind[] {
  const requiresConnection = definition.connection !== undefined;
  return (definition.automationKinds ?? []).map((contribution) => ({
    kind: contribution.kind,
    integrationId: definition.id,
    label: contribution.label,
    description: contribution.description ?? '',
    icon: contribution.icon ?? 'zap',
    requiresConnection: contribution.requiresConnection ?? requiresConnection,
    connected: true,
  }));
}

function metaOf(values: Record<string, string | null>): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== null) {
      meta[key] = value;
    }
  }
  return meta;
}
