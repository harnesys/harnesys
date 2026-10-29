import { Injectable } from '@harnesys/brix';
import type { ListConnectorsResponse } from '@harnesys/contracts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { findConnectorThread, toConnectorPublic } from './connector.helpers.ts';

export interface ListConnectorsRequest {
  orgId: string;
  agentId: string;
}

@Injectable()
export class ListConnectorsUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
  ) {}

  execute(request: ListConnectorsRequest): ListConnectorsResponse {
    const items = this.connectors
      .listByOrg(request.orgId)
      .filter((c) => c.agentId === request.agentId)
      .map((c) => {
        const binding = this.connectors.findActiveBinding(request.orgId, c.id);
        const thread =
          binding !== undefined
            ? this.threads.findById(request.orgId, binding.threadId)
            : findConnectorThread(this.threads, request.orgId, c.id);
        if (!thread) {
          return null;
        }
        return toConnectorPublic(c, thread.id);
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    return { items };
  }
}
