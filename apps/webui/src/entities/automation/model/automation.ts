import type {
  AutomationConnection,
  AutomationItem,
  AutomationSource,
  AutomationStatus,
} from '@harnesys/contracts';

export type { AutomationConnection, AutomationSource, AutomationStatus };

export const CORE_AUTOMATION_INTEGRATION_ID = 'core';

export function automationStatusLabel(status: AutomationStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'failed':
      return 'Failed';
  }
}
export function automationInk(status: AutomationStatus): string {
  switch (status) {
    case 'active':
      return 'text-live';
    case 'paused':
      return 'text-muted-foreground';
    case 'failed':
      return 'text-destructive';
  }
}
export interface ClientAutomation {
  id: string;
  projectId: string;
  integrationId: string;
  kind: string;
  source: AutomationSource;
  label: string;
  description: string;
  status: AutomationStatus;
  threadId: string | null;
  targetAgentId: string | null;
  connection: AutomationConnection;
  meta: Record<string, string>;
  availableAt: string | null;
  updatedAt: string;
}
export function isCoreAutomation(automation: ClientAutomation): boolean {
  return automation.integrationId === CORE_AUTOMATION_INTEGRATION_ID;
}
export function isScheduleAutomationKind(kind: string): boolean {
  return kind === 'scheduler' || kind === 'schedule';
}
export function toClientAutomation(item: AutomationItem): ClientAutomation {
  return {
    id: item.id,
    projectId: item.orgId,
    integrationId: item.integrationId,
    kind: item.kind,
    source: item.source,
    label: item.label,
    description: item.description,
    status: item.status,
    threadId: item.threadId,
    targetAgentId: item.targetAgentId,
    connection: item.connection,
    meta: item.meta,
    availableAt: item.availableAt,
    updatedAt: item.updatedAt,
  };
}
