import { Injectable } from '@harnesys/brix';
import type { ListAutomationsResponse } from '@harnesys/contracts';
import { AutomationCatalogPort } from '../../domain/automations/automation-catalog.port.ts';

export interface ListAutomationsRequest {
  orgId: string;
}

@Injectable()
export class ListAutomationsUseCase {
  constructor(private readonly automations: AutomationCatalogPort) {}

  execute(request: ListAutomationsRequest): ListAutomationsResponse {
    return { items: this.automations.items(request.orgId) };
  }
}
