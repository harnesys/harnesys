import { Injectable } from '@harnesys/brix';
import type { DisconnectIntegrationResponse } from '@harnesys/contracts';
import { IntegrationNotFoundException } from '../../domain/integration/integration.error.ts';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { DetachSourceUseCase } from '../source/detach-source.use-case.ts';

export interface DisconnectIntegrationInput {
  orgId: string;
  integrationId: string;
}

@Injectable()
export class DisconnectIntegrationUseCase {
  constructor(
    private readonly registry: IntegrationRegistryPort,
    private readonly sources: SourceRegistryPort,
    private readonly detachSource: DetachSourceUseCase,
  ) {}

  execute(input: DisconnectIntegrationInput): DisconnectIntegrationResponse {
    const integration = this.registry.findById(input.orgId, input.integrationId);
    if (!integration) {
      throw new IntegrationNotFoundException(input.orgId, input.integrationId);
    }
    const attached = this.sources
      .list(input.orgId)
      .filter(
        (source) =>
          source.distribution.kind === 'cloud-drive' &&
          source.distribution.integrationId === input.integrationId,
      );
    for (const source of attached) {
      this.detachSource.execute({ orgId: input.orgId, sourceId: source.id });
    }
    this.registry.remove(input.orgId, input.integrationId);
    return { detachedSources: attached.length };
  }
}
