import type { AutomationConnection, AutomationItem, AutomationKind } from '@harnesys/contracts';
import type { AutomationUpsertInput, IntegrationDefinition } from 'harnesys/integration';

export interface AutomationSnapshotSource {
  integrationId: string;
  connection: AutomationConnection;
  items: AutomationUpsertInput[];
}

export interface MergeAutomationInput {
  orgId: string;
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
  const items: AutomationItem[] = [];
  for (const source of input.addons) {
    for (const snapshot of source.items) {
      items.push(
        toAddonAutomationItem(input.orgId, source.integrationId, snapshot, source.connection),
      );
    }
  }
  return items;
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
    source: 'integration',
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
    source: 'integration',
    label: contribution.label,
    description: contribution.description ?? '',
    icon: contribution.icon ?? 'zap',
    color: '',
    requiresConnection: contribution.requiresConnection ?? requiresConnection,
    connected: true,
  }));
}
