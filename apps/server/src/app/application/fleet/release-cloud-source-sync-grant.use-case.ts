import { Injectable, UnauthorizedException } from '@harnesys/brix';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { SourceWriteLeasePort } from '../../domain/fleet/source-write-lease.port.ts';
import { hashNodeToken } from './hash-node-token.ts';

export interface ReleaseCloudSourceSyncGrantInput {
  orgId: string;
  bearerToken: string;
  sourceId: string;
  operationId: string;
}

@Injectable()
export class ReleaseCloudSourceSyncGrantUseCase {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly writeLeases: SourceWriteLeasePort,
  ) {}

  execute(input: ReleaseCloudSourceSyncGrantInput): void {
    const node = this.nodes.findByTokenHash(input.orgId, hashNodeToken(input.bearerToken.trim()));
    if (!node) {
      throw new UnauthorizedException('node unauthorized');
    }
    const lease = this.writeLeases.find(input.orgId, input.sourceId);
    if (lease?.runId !== input.operationId || lease.nodeId !== node.id) {
      return;
    }
    this.writeLeases.release(input.orgId, input.sourceId, input.operationId);
  }
}
