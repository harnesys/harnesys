import { Injectable } from '@harnesys/brix';
import type { ListAutomationKindsResponse } from '@harnesys/contracts';
import { AutomationCatalogPort } from '../../domain/automations/automation-catalog.port.ts';

@Injectable()
export class ListAutomationKindsUseCase {
  constructor(private readonly automations: AutomationCatalogPort) {}

  execute(orgId: string): ListAutomationKindsResponse {
    return { items: this.automations.kinds(orgId) };
  }
}
