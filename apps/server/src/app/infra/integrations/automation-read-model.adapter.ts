import { Injectable } from '@harnesys/brix';
import type { AutomationItem, AutomationKind } from '@harnesys/contracts';
import { AutomationReadModelPort } from '../../domain/automations/automation-read-model.port.ts';
import { IntegrationHostPort } from '../../domain/integration/integration-host.port.ts';

@Injectable()
export class AutomationReadModelAdapter extends AutomationReadModelPort {
  constructor(private readonly host: IntegrationHostPort) {
    super();
  }

  override items(orgId: string): AutomationItem[] {
    return this.host.automationItems(orgId);
  }

  override kinds(orgId: string): AutomationKind[] {
    return this.host.automationKinds(orgId);
  }
}
