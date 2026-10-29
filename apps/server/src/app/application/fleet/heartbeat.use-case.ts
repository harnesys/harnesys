import { ForbiddenException, Injectable, UnauthorizedException } from '@harnesys/brix';
import type { HeartbeatResponse } from '@harnesys/contracts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { authorize } from '../../domain/identity/authorize.ts';
import { type NodePrincipal } from '../../domain/identity/principal.ts';
import { hashNodeToken } from './hash-node-token.ts';

export interface HeartbeatInput {
  orgId: string;
  bearerToken: string;
  diskFreeBytes?: number | null;
  diskTotalBytes?: number | null;
}

@Injectable()
export class HeartbeatUseCase {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly hub: FleetHubPort,
  ) {}

  execute(input: HeartbeatInput): HeartbeatResponse {
    const token = input.bearerToken.trim();
    if (!token) {
      throw new UnauthorizedException('node token required');
    }
    const row = this.nodes.findByTokenHash(input.orgId, hashNodeToken(token));
    if (!row) {
      throw new UnauthorizedException('node unauthorized');
    }
    const principal: NodePrincipal = { kind: 'node', nodeId: row.id, orgId: input.orgId };
    if (!authorize(principal, 'heartbeat')) {
      throw new ForbiddenException('heartbeat action is required for nodes');
    }
    const status = this.hub.notePing({
      orgId: input.orgId,
      nodeId: row.id,
      diskFreeBytes: input.diskFreeBytes,
      diskTotalBytes: input.diskTotalBytes,
    });
    return { ok: true, status: status ?? 'offline' };
  }
}
