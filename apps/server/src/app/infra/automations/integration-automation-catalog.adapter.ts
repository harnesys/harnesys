import { Injectable } from '@harnesys/brix';
import type { AutomationItem, AutomationKind } from '@harnesys/contracts';
import { AutomationCatalogContributorPort } from '../../domain/automations/automation-catalog-contributor.port.ts';
import { AutomationReadModelPort } from '../../domain/automations/automation-read-model.port.ts';

@Injectable()
export class IntegrationAutomationCatalogAdapter extends AutomationCatalogContributorPort {
  constructor(private readonly legacy: AutomationReadModelPort) {
    super();
  }

  override items(orgId: string): AutomationItem[] {
    return this.legacy.items(orgId);
  }

  override kinds(orgId: string): AutomationKind[] {
    return this.legacy.kinds(orgId);
  }
}
