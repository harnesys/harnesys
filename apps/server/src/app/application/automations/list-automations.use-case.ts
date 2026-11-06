import { Injectable } from '@harnesys/brix';
import type { ListAutomationsResponse } from '@harnesys/contracts';
import { AutomationReadModelPort } from '../../domain/automations/automation-read-model.port.ts';

export interface ListAutomationsRequest {
  orgId: string;
}

@Injectable()
export class ListAutomationsUseCase {
  constructor(private readonly automations: AutomationReadModelPort) {}

  execute(request: ListAutomationsRequest): ListAutomationsResponse {
    return { items: this.automations.items(request.orgId) };
  }
}
