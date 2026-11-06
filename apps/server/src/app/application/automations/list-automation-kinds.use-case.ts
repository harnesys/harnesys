import { Injectable } from '@harnesys/brix';
import type { ListAutomationKindsResponse } from '@harnesys/contracts';
import { AutomationReadModelPort } from '../../domain/automations/automation-read-model.port.ts';

@Injectable()
export class ListAutomationKindsUseCase {
  constructor(private readonly automations: AutomationReadModelPort) {}

  execute(orgId: string): ListAutomationKindsResponse {
    return { items: this.automations.kinds(orgId) };
  }
}
