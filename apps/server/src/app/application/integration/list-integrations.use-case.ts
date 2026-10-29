import { Injectable } from '@harnesys/brix';
import type { IntegrationsListResponse } from '@harnesys/contracts';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';

export interface ListIntegrationsInput {
  orgId: string;
}

@Injectable()
export class ListIntegrationsUseCase {
  constructor(private readonly registry: IntegrationRegistryPort) {}

  execute(input: ListIntegrationsInput): IntegrationsListResponse {
    return { integrations: this.registry.list(input.orgId) };
  }
}
